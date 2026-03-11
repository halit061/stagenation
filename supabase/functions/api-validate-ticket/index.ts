import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders } from "../_shared/cors.ts";

interface ValidateTicketRequest {
  token: string;
  scanner_user_id?: string;
  active_event_id?: string;
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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // SECURITY: Require authentication - must be a scanner, admin, or super_admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ status: 'UNAUTHORIZED', message: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const jwtToken = authHeader.replace('Bearer ', '');

    // Reject anon key - require real user JWT
    if (jwtToken === supabaseAnonKey || jwtToken === supabaseServiceKey) {
      return new Response(
        JSON.stringify({ status: 'UNAUTHORIZED', message: 'User authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(jwtToken);
    if (authError || !authUser) {
      return new Response(
        JSON.stringify({ status: 'UNAUTHORIZED', message: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        JSON.stringify({ status: 'FORBIDDEN', message: 'Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let requestBody: ValidateTicketRequest;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return new Response(
        JSON.stringify({ status: 'INVALID' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { token, scanner_user_id, active_event_id } = requestBody;

    if (!token || typeof token !== 'string' || token.trim() === '') {
      return new Response(
        JSON.stringify({ status: 'INVALID' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let ticket = null;
    const ticketCols = 'id, order_id, event_id, ticket_number, token, secure_token, qr_code, qr_data, status, used_at, holder_name';

    const lookups: { field: string; label: string }[] = [
      { field: 'qr_code', label: 'qr_code' },
      { field: 'qr_data', label: 'qr_data' },
      { field: 'ticket_number', label: 'ticket_number' },
      { field: 'token', label: 'token' },
      { field: 'secure_token', label: 'secure_token' },
    ];

    for (const lookup of lookups) {
      const { data } = await supabase
        .from('tickets')
        .select(ticketCols)
        .eq(lookup.field, token)
        .maybeSingle();
      if (data) {
        ticket = data;
        break;
      }
    }

    if (!ticket) {
      return new Response(
        JSON.stringify({ status: 'INVALID' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (active_event_id && ticket.event_id !== active_event_id) {
      return new Response(
        JSON.stringify({
          status: 'WRONG_EVENT',
          ticketId: ticket.id,
          eventId: ticket.event_id,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: event } = await supabase
      .from('events')
      .select('id, name, scan_open_at, scan_close_at, is_active')
      .eq('id', ticket.event_id)
      .maybeSingle();

    if (!event) {
      return new Response(
        JSON.stringify({ status: 'INVALID' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!event.is_active) {
      return new Response(
        JSON.stringify({
          status: 'EVENT_CLOSED',
          message: 'Event is not active',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const now = new Date();

    if (event.scan_open_at) {
      const scanOpenAt = new Date(event.scan_open_at);
      if (now < scanOpenAt) {
        return new Response(
          JSON.stringify({
            status: 'NOT_YET_OPEN',
            message: 'Scanning not yet open for this event',
            scan_open_at: event.scan_open_at,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    if (event.scan_close_at) {
      const scanCloseAt = new Date(event.scan_close_at);
      if (now > scanCloseAt) {
        return new Response(
          JSON.stringify({
            status: 'EVENT_CLOSED',
            message: 'Scanning has closed for this event',
            scan_close_at: event.scan_close_at,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    if (ticket.status === 'used') {
      return new Response(
        JSON.stringify({
          status: 'ALREADY_USED',
          ticketId: ticket.id,
          used_at: ticket.used_at,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (ticket.status === 'valid') {
      const usedAt = new Date().toISOString();

      const { error: updateError } = await supabase
        .from('tickets')
        .update({
          status: 'used',
          used_at: usedAt,
        })
        .eq('id', ticket.id)
        .eq('status', 'valid');

      if (updateError) {
        console.error('Failed to update ticket status:', updateError);
        return new Response(
          JSON.stringify({ status: 'INVALID' }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(
        JSON.stringify({
          status: 'OK',
          ticketId: ticket.id,
          eventId: ticket.event_id,
          used_at: usedAt,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ status: 'INVALID' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Validate-ticket API error:', error);
    return new Response(
      JSON.stringify({ status: 'INVALID' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
