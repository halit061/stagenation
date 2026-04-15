import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders } from "../_shared/cors.ts";

interface DeleteTicketRequest {
  ticket_id: string;
}

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
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
    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: userRoles } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const isSuperAdmin = userRoles?.some(r =>
      ['superadmin', 'super_admin'].includes(r.role)
    );

    if (!isSuperAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Only super admins can delete tickets' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: DeleteTicketRequest = await req.json();
    const { ticket_id } = body;

    if (!ticket_id || !isValidUUID(ticket_id)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Valid ticket_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: ticket, error: ticketError } = await adminClient
      .from('tickets')
      .select('*, orders(id, event_id, status)')
      .eq('id', ticket_id)
      .maybeSingle();

    if (ticketError) {
      return new Response(
        JSON.stringify({ success: false, error: `Database error: ${ticketError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!ticket) {
      return new Response(
        JSON.stringify({ success: false, error: 'Ticket niet gevonden' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const wasScanned = ticket.status === 'used' || ticket.scan_status === 'scanned';
    const orderId = ticket.order_id;
    const isGuestTicket = ticket.orders?.status === 'comped';

    const { error: deleteTicketError } = await adminClient
      .from('tickets')
      .delete()
      .eq('id', ticket_id);

    if (deleteTicketError) {
      throw new Error(`Ticket verwijderen mislukt: ${deleteTicketError.message}`);
    }

    if (isGuestTicket && orderId) {
      await adminClient
        .from('guest_ticket_qrs')
        .delete()
        .eq('order_id', orderId);

      const { data: remainingTickets } = await adminClient
        .from('tickets')
        .select('id')
        .eq('order_id', orderId)
        .limit(1);

      if (!remainingTickets || remainingTickets.length === 0) {
        await adminClient
          .from('email_logs')
          .delete()
          .eq('order_id', orderId);
        await adminClient
          .from('orders')
          .delete()
          .eq('id', orderId);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Ticket deleted successfully',
        ticket_number: ticket.ticket_number,
        was_scanned: wasScanned,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
