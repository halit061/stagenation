import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders } from "../_shared/cors.ts";

const VALIDATE_RATE_LIMIT_MAX = 60;
const VALIDATE_RATE_LIMIT_WINDOW = 60;

function getClientIp(req: Request): string {
  // SECURITY: Check trusted proxy headers first (cf-connecting-ip cannot be spoofed by clients)
  return req.headers.get('cf-connecting-ip')
    || req.headers.get('x-real-ip')
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
}

interface ValidateRequest {
  token: string;
  ticketId?: string;
  scannerId?: string;
  locationId?: string;
  deviceInfo?: any;
}

const ticketSelect = '*, ticket_types(*), events(*)';

async function findTicket(supabase: any, token: string, ticketId?: string) {
  if (ticketId) {
    const { data } = await supabase
      .from('tickets')
      .select(ticketSelect)
      .eq('id', ticketId)
      .eq('token', token)
      .maybeSingle();
    if (data) return data;
  }

  const { data: byToken } = await supabase
    .from('tickets')
    .select(ticketSelect)
    .eq('token', token)
    .maybeSingle();
  if (byToken) return byToken;

  const { data: byQrCode } = await supabase
    .from('tickets')
    .select(ticketSelect)
    .eq('qr_code', token)
    .maybeSingle();
  if (byQrCode) return byQrCode;

  const { data: byQrData } = await supabase
    .from('tickets')
    .select(ticketSelect)
    .eq('qr_data', token)
    .maybeSingle();
  if (byQrData) return byQrData;

  const { data: bySecureToken } = await supabase
    .from('tickets')
    .select(ticketSelect)
    .eq('secure_token', token)
    .maybeSingle();
  if (bySecureToken) return bySecureToken;

  const { data: byTicketNumber } = await supabase
    .from('tickets')
    .select(ticketSelect)
    .eq('ticket_number', token)
    .maybeSingle();
  if (byTicketNumber) return byTicketNumber;

  return null;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

        const jwtToken = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(jwtToken);
    if (authError || !authUser) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token', code: 'INVALID_JWT' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

        const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role, is_active')
      .eq('user_id', authUser.id)
      .eq('is_active', true);

    const hasPermission = userRoles?.some(
      (r: { role: string }) => r.role === 'scanner' || r.role === 'admin' || r.role === 'super_admin' || r.role === 'superadmin'
    );

    if (!hasPermission) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions', code: 'FORBIDDEN' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const clientIp = getClientIp(req);
    const { data: rateResult } = await supabase.rpc('check_rate_limit', {
      p_key: `validate:${clientIp}`,
      p_max_attempts: VALIDATE_RATE_LIMIT_MAX,
      p_window_seconds: VALIDATE_RATE_LIMIT_WINDOW,
    });

    if (rateResult && !rateResult.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Too many validation attempts. Please wait.',
          retry_after_seconds: rateResult.retry_after_seconds,
        }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': String(rateResult.retry_after_seconds) },
        }
      );
    }

    const { token, ticketId, scannerId, locationId, deviceInfo }: ValidateRequest = await req.json();

    if (!token || typeof token !== 'string' || token.trim() === '') {
      return new Response(
        JSON.stringify({
          valid: false,
          result: 'invalid',
          status: 'INVALID',
          message: 'Token is verplicht',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const ticket = await findTicket(supabase, token.trim(), ticketId);

    if (!ticket) {
      return new Response(
        JSON.stringify({
          valid: false,
          result: 'invalid',
          status: 'INVALID',
          message: 'Ticket niet gevonden of token ongeldig'
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let result: string = 'valid';
    let message = 'Ticket geldig';
    let statusCode = 'OK';
    const now = new Date().toISOString();

    if (ticket.status === 'used') {
      result = 'already_used';
      statusCode = 'ALREADY_USED';
      message = `Ticket al gescand op ${new Date(ticket.used_at).toLocaleString('nl-BE')}`;
    } else if (ticket.status === 'revoked') {
      result = 'revoked';
      statusCode = 'INVALID';
      message = `Ticket ingetrokken: ${ticket.revoked_reason || 'Geen reden opgegeven'}`;
    } else if (ticket.token_expires_at && new Date(ticket.token_expires_at) < new Date()) {
      result = 'expired';
      statusCode = 'INVALID';
      message = 'Ticket token verlopen';
    } else if (ticket.status === 'valid') {
      const { error: updateError } = await supabase
        .from('tickets')
        .update({ status: 'used', used_at: now })
        .eq('id', ticket.id)
        .eq('status', 'valid');

      if (updateError) {
        console.error('Failed to update ticket status:', updateError.message);
      }

      result = 'valid';
      statusCode = 'OK';
      message = 'Ticket succesvol gescand';
    } else if (ticket.status === 'pending') {
      result = 'invalid';
      statusCode = 'INVALID';
      message = 'Ticket is nog niet betaald';
    } else {
      result = 'invalid';
      statusCode = 'INVALID';
      message = 'Ticket status ongeldig';
    }

    try {
      await supabase.from('scans').insert({
        ticket_id: ticket.id,
        scanner_id: scannerId || null,
        event_id: ticket.event_id,
        result,
        location_id: locationId,
        device_info: deviceInfo || {},
      });
    } catch (scanLogError: any) {
      console.error('Failed to log scan:', scanLogError.message);
    }

    if (scannerId) {
      try {
        await supabase
          .from('scanners')
          .update({ last_scan_at: new Date().toISOString() })
          .eq('id', scannerId);
      } catch (_e) {}
    }

    return new Response(
      JSON.stringify({
        valid: result === 'valid',
        result,
        status: statusCode,
        message,
        ticket_id: ticket.id,
        event_id: ticket.event_id,
        used_at: ticket.status === 'used' ? (ticket.used_at || now) : null,
        ticket: {
          number: ticket.ticket_number,
          type: ticket.ticket_types?.name,
          event: ticket.events?.name,
          holder: ticket.holder_name,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('validate-ticket error:', error.message);
    return new Response(
      JSON.stringify({
        valid: false,
        result: 'invalid',
        status: 'ERROR',
        message: 'Er ging iets mis bij het valideren',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
