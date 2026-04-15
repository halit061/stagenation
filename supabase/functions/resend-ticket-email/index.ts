import { createClient } from 'npm:@supabase/supabase-js@2';
import { Resend } from 'npm:resend@4.0.0';
import QRCode from 'npm:qrcode@1.5.4';
import { getCorsHeaders } from "../_shared/cors.ts";

interface ResendTicketRequest {
  ticket_id: string;
}

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

async function generateQRCode(data: string): Promise<string> {
  return await QRCode.toDataURL(data, { width: 300, margin: 2 });
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('nl-BE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Europe/Brussels',
  });
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('nl-BE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Brussels',
  });
}

async function buildSingleTicketEmail(ticket: any, event: any, order: any): Promise<string> {
  const qrData = ticket.qr_code || ticket.token || ticket.id;
  const qrDataUrl = await generateQRCode(qrData);

  const BASE_URL = Deno.env.get('BASE_URL') || 'https://stagenation.be';
  const viewUrl = `${BASE_URL}/ticket-view?token=${ticket.public_token}`;

  const theme = ticket.ticket_types?.theme;
  const headerBg = theme?.header_bg || 'linear-gradient(135deg, #0e7490 0%, #0369a1 100%)';
  const headerText = theme?.header_text || '#ffffff';
  const cardBg = theme?.card_bg || '#ffffff';
  const cardBorder = theme?.card_border || '#e2e8f0';
  const badgeText = theme?.badge_text || '';
  const badgeBg = theme?.badge_bg || '#D4AF37';
  const badgeTextColor = theme?.badge_text_color || '#1a1a1a';
  const btnColor = headerBg && !headerBg.includes('gradient') ? headerBg : '#0e7490';

  const badgeHtml = badgeText ? `
      <div style="text-align: center; margin-bottom: 12px;">
        <span style="display: inline-block; background: ${badgeBg}; color: ${badgeTextColor}; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; padding: 4px 14px; border-radius: 20px; text-transform: uppercase;">
          ${badgeText}
        </span>
      </div>` : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Je ticket voor ${event.name}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background: ${headerBg}; padding: 40px 24px; text-align: center;">
      <h1 style="color: ${headerText}; margin: 0; font-size: 28px; font-weight: 700;">
        Je ticket voor ${event.name}
      </h1>
      <p style="color: ${headerText}; opacity: 0.85; margin: 12px 0 0 0; font-size: 16px;">
        Bedankt voor je aankoop bij StageNation
      </p>
    </div>

    <!-- Content -->
    <div style="padding: 32px 24px;">

      <!-- Event Details -->
      <div style="background-color: #f1f5f9; border-left: 4px solid #0e7490; padding: 20px; margin-bottom: 32px; border-radius: 8px;">
        <h2 style="color: #0f172a; margin-top: 0; margin-bottom: 16px; font-size: 20px;">
          Event Details
        </h2>
        <p style="color: #475569; margin: 8px 0; font-size: 15px; line-height: 1.6;">
          <strong style="color: #0f172a;">Locatie:</strong> ${event.location}<br />
          ${event.location_address ? `<span style="color: #64748b; font-size: 14px;">${event.location_address}</span><br />` : ''}
          <strong style="color: #0f172a;">Datum:</strong> ${formatDate(event.start_date)}<br />
          <strong style="color: #0f172a;">Tijd:</strong> ${formatTime(event.start_date)}
        </p>
      </div>

      <!-- Ticket -->
      <div style="background-color: ${cardBg}; border: 2px solid ${cardBorder}; border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        ${badgeHtml}
        <h3 style="color: #0f172a; margin-top: 0; margin-bottom: 16px; font-size: 18px; text-align: center;">
          ${ticket.ticket_types?.name || 'Ticket'}
        </h3>
        <div style="text-align: center; margin: 20px 0;">
          <img src="${qrDataUrl}" width="220" height="220" alt="QR Code ${ticket.ticket_number}" style="display: block; margin: 0 auto; width: 220px; height: 220px; border: 1px solid #cbd5e1; border-radius: 8px;" />
        </div>
        <div style="background-color: #f1f5f9; border-radius: 8px; padding: 16px; margin: 16px 0; text-align: center;">
          <p style="color: #64748b; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">
            Ticket Nummer
          </p>
          <p style="color: #0f172a; font-size: 18px; font-weight: 700; margin: 0; font-family: 'Courier New', monospace; letter-spacing: 1px;">
            ${ticket.ticket_number}
          </p>
        </div>
        <div style="text-align: center; margin: 12px 0; padding: 12px; background-color: #f8fafc; border-radius: 6px;">
          <p style="color: #64748b; font-size: 12px; margin: 0 0 8px 0;">
            QR niet zichtbaar? Open je ticket hier:
          </p>
          <a href="${viewUrl}" style="display: inline-block; background-color: ${btnColor}; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 6px; font-size: 14px; font-weight: 600;">
            Open ticket
          </a>
        </div>
        <p style="color: #64748b; font-size: 14px; margin: 12px 0; text-align: center;">
          <strong style="color: #0f172a;">Naam:</strong> ${ticket.holder_name}<br />
          <strong style="color: #0f172a;">Email:</strong> ${ticket.holder_email}
        </p>
      </div>

      <!-- Important Notice -->
      <div style="background-color: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px; padding: 16px; margin-top: 32px;">
        <p style="color: #92400e; margin: 0; font-size: 14px; line-height: 1.6;">
          <strong>Belangrijk:</strong> Vergeet dit ticket niet aan de ingang te tonen.
          Je kunt de QR-code op je telefoon laten zien of het ticket afdrukken.
          Dit ticket kan slechts een keer worden gescand.
        </p>
      </div>

    </div>

    <!-- Footer -->
    <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="color: #64748b; margin: 0; font-size: 14px; line-height: 1.6;">
        Met vriendelijke groeten,<br />
        <strong style="color: #0f172a;">StageNation</strong>
      </p>
      <p style="color: #94a3b8; margin: 16px 0 0 0; font-size: 12px;">
        Voor vragen, neem contact met ons op via <a href="mailto:tickets@stagenation.be" style="color: #0e7490; text-decoration: none;">tickets@stagenation.be</a>
      </p>
    </div>

  </div>
</body>
</html>
  `;
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
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured');
    }

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

    const isAdmin = userRoles?.some(r =>
      ['admin', 'superadmin', 'super_admin', 'organizer'].includes(r.role)
    );

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: ResendTicketRequest = await req.json();
    const { ticket_id } = body;

    if (!ticket_id || !isValidUUID(ticket_id)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Valid ticket_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: ticket, error: ticketError } = await adminClient
      .from('tickets')
      .select('*, ticket_types(*), orders(*, events(*))')
      .eq('id', ticket_id)
      .maybeSingle();

    if (ticketError || !ticket) {
      return new Response(
        JSON.stringify({ success: false, error: 'Ticket not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const order = ticket.orders;
    const event = order?.events;

    if (!event) {
      return new Response(
        JSON.stringify({ success: false, error: 'Event not found for this ticket' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const recipientEmail = ticket.holder_email || order?.payer_email;
    if (!recipientEmail) {
      return new Response(
        JSON.stringify({ success: false, error: 'No recipient email found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const html = await buildSingleTicketEmail(ticket, event, order);
    const emailSubject = `Je ticket voor ${event.name}`;

    const resend = new Resend(resendApiKey);
    const emailFrom = Deno.env.get('EMAIL_FROM') || 'StageNation Tickets <tickets@lumetrix.be>';

    const result = await resend.emails.send({
      from: emailFrom,
      to: [recipientEmail],
      reply_to: 'tickets@stagenation.be',
      subject: emailSubject,
      html,
    });

    if (result?.error) {
      throw new Error(`Resend API error: ${result.error.message || JSON.stringify(result.error)}`);
    }

    const emailId = result?.data?.id || result?.id;

    await adminClient
      .from('email_logs')
      .insert({
        ticket_id: ticket_id,
        email: recipientEmail,
        action: 'resend',
        admin_user_id: user.id,
        ticket_number: ticket.ticket_number,
        event_id: event.id,
      });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Email sent successfully',
        ticket_number: ticket.ticket_number,
        recipient: recipientEmail,
        email_id: emailId,
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
