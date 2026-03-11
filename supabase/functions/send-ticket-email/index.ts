import { createClient } from 'npm:@supabase/supabase-js@2';
import { Resend } from 'npm:resend@4.0.0';
import { jsPDF } from 'npm:jspdf@2.5.2';
import QRCode from 'npm:qrcode@1.5.4';
import { getCorsHeaders } from "../_shared/cors.ts";

interface SendTicketEmailRequest {
  orderId?: string;
  orderNumber?: string;
  resend?: boolean;
  source?: string;
}

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

async function generateQRCode(data: string): Promise<string> {
  return await QRCode.toDataURL(data, { width: 300, margin: 2 });
}

async function sendEmail({ to, subject, html, attachments }: { to: string; subject: string; html: string; attachments?: { filename: string; content: string }[] }): Promise<{ id: string }> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const emailFrom = Deno.env.get('EMAIL_FROM') || 'BizimEvents Tickets <tickets@lumetrix.be>';

  if (!resendApiKey) {
    console.error('CRITICAL: RESEND_API_KEY is not configured!');
    throw new Error('Email service not configured - RESEND_API_KEY missing');
  }

  const resend = new Resend(resendApiKey);

  try {
    const emailPayload: any = {
      from: emailFrom,
      to: [to],
      reply_to: 'info@bizimevents.be',
      subject,
      html,
    };
    if (attachments && attachments.length > 0) {
      emailPayload.attachments = attachments.map(a => ({
        filename: a.filename,
        content: a.content,
        content_type: 'application/pdf',
      }));
    }
    const result = await resend.emails.send(emailPayload);

    if (result?.error) {
      console.error('EMAIL_SEND: Resend API error:', JSON.stringify(result.error));
      throw new Error(`Resend API error: ${result.error.message || JSON.stringify(result.error)}`);
    }

    const emailId = result?.data?.id || result?.id;
    if (!emailId) {
      console.error('EMAIL_SEND: Resend API returned no email ID');
      throw new Error('Resend API returned no email ID');
    }

    return { id: emailId };
  } catch (error) {
    console.error('EMAIL_SEND: Exception:', error.message);
    throw new Error(`Failed to send email via Resend: ${error.message}`);
  }
}

// SECURITY: Escape HTML to prevent HTML injection in emails
function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch {
    return null;
  }
}

async function buildTicketPdf(order: any, event: any, tickets: any[]): Promise<string> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;

  for (let i = 0; i < tickets.length; i++) {
    if (i > 0) doc.addPage();
    const ticket = tickets[i];
    let y = margin;

    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(event.name || 'Event', pageWidth / 2, y, { align: 'center' });
    y += 12;

    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 10;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');

    const details = [
      { label: 'Datum', value: formatDate(event.start_date) },
      { label: 'Tijd', value: formatTime(event.start_date) },
      { label: 'Locatie', value: event.location || '' },
      { label: 'Ordernummer', value: order.order_number },
      { label: 'Ticket', value: ticket.ticket_types?.name || 'Ticket' },
      { label: 'Ticketnummer', value: ticket.ticket_number },
      { label: 'Naam', value: ticket.holder_name || order.payer_name || '' },
      { label: 'Email', value: ticket.holder_email || order.payer_email || '' },
    ];

    for (const d of details) {
      if (!d.value) continue;
      doc.setFont('helvetica', 'bold');
      doc.text(`${d.label}:`, margin, y);
      doc.setFont('helvetica', 'normal');
      doc.text(d.value, margin + 40, y);
      y += 7;
    }

    y += 5;
    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 10;

    const qrData = ticket.qr_data || ticket.token || ticket.id;
    const qrDataUrl = await QRCode.toDataURL(qrData, { width: 400, margin: 2 });
    const qrBase64 = qrDataUrl.split(',')[1] || null;

    if (qrBase64) {
      const qrSize = 60;
      const qrX = (pageWidth - qrSize) / 2;
      doc.addImage(`data:image/png;base64,${qrBase64}`, 'PNG', qrX, y, qrSize, qrSize);
      y += qrSize + 8;
    }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120);
    doc.text('Toon deze QR-code bij de ingang. Elk ticket kan slechts 1x gescand worden.', pageWidth / 2, y, { align: 'center' });
    doc.setTextColor(0);
  }

  const pdfBase64 = doc.output('datauristring').split(',')[1];
  return pdfBase64;
}

async function buildTableReservationEmail(order: any, event: any, tableBookings: any[], brand: any): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const logoUrl = event.logo_url
    ? `${supabaseUrl}/storage/v1/object/public/${event.logo_url}`
    : 'https://i.imgur.com/placeholder.png';

  const BASE_URL = Deno.env.get('BASE_URL') || 'https://bizimevents.be';
  const eskilerLogoUrl = `${BASE_URL}/eskiler-logo-4.png`;

  const footerName = brand?.display_name || brand?.name || 'BizimEvents';
  const footerEmail = brand?.support_email || brand?.email || 'info@bizimevents.be';

  const tableQrCodes = await Promise.all(
    tableBookings.map(async (booking) => {
      const qrData = booking.booking_code || booking.id;
      return {
        booking,
        qrDataUrl: await generateQRCode(qrData),
      };
    })
  );

  const tableRows = tableQrCodes
    .map(
      ({ booking, qrDataUrl }) => `
    <div style="background-color: #ffffff; border: 2px solid #e2e8f0; border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
      <h3 style="color: #0f172a; margin-top: 0; margin-bottom: 16px; font-size: 18px; text-align: center;">
        Tafel ${booking.floorplan_tables?.table_number || 'N/A'}
      </h3>
      <div style="text-align: center; margin: 20px 0;">
        <img src="${qrDataUrl}" width="220" height="220" alt="QR Code ${booking.booking_code}" style="display: block; margin: 0 auto; width: 220px; height: 220px; border: 1px solid #cbd5e1; border-radius: 8px;" />
      </div>
      <div style="background-color: #f1f5f9; border-radius: 8px; padding: 16px; margin: 16px 0; text-align: center;">
        <p style="color: #64748b; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">
          Reservatiecode
        </p>
        <p style="color: #0f172a; font-size: 18px; font-weight: 700; margin: 0; font-family: 'Courier New', monospace; letter-spacing: 1px;">
          ${booking.booking_code}
        </p>
        <p style="color: #64748b; font-size: 11px; margin: 8px 0 0 0;">
          Toon deze code aan de ingang als de QR niet laadt
        </p>
      </div>
      <p style="color: #64748b; font-size: 14px; margin: 12px 0; text-align: center;">
        <strong style="color: #0f172a;">Capaciteit:</strong> ${booking.floorplan_tables?.capacity || 'N/A'} personen<br />
        <strong style="color: #0f172a;">Type:</strong> ${booking.floorplan_tables?.table_type === 'SEATED' ? 'Zittafel' : 'Sta-tafel'}<br />
        <strong style="color: #0f172a;">Aantal gasten:</strong> ${booking.number_of_guests}<br />
        <strong style="color: #0f172a;">Prijs:</strong> EUR${(parseFloat(booking.total_price) || 0).toFixed(2)}
      </p>
      ${booking.special_requests ? `
        <div style="margin-top: 16px; padding: 12px; background-color: #f1f5f9; border-radius: 8px;">
          <p style="color: #475569; font-size: 13px; margin: 0;">
            <strong style="color: #0f172a;">Speciale verzoeken:</strong><br />
            ${escapeHtml(booking.special_requests)}
          </p>
        </div>
      ` : ''}
    </div>
  `
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Je tafelreservatie voor ${event.name}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, #0e7490 0%, #0369a1 100%); padding: 40px 24px; text-align: center;">
      ${event.logo_url ? `<div style="margin-bottom: 20px;">
        <img src="${logoUrl}" alt="${event.name}" style="max-width: 200px; height: auto; display: inline-block;" />
      </div>` : ''}
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">
        Je tafelreservatie voor ${event.name}
      </h1>
      <p style="color: #e0f2fe; margin: 12px 0 0 0; font-size: 16px;">
        Bedankt voor je reservatie bij BizimEvents
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

      <!-- Order Summary -->
      <div style="margin-bottom: 32px;">
        <h2 style="color: #0f172a; margin-bottom: 16px; font-size: 20px;">
          Ordernummer: ${order.order_number}
        </h2>
        <p style="color: #64748b; font-size: 14px; margin: 8px 0;">
          <strong>Email:</strong> ${escapeHtml(order.payer_email)}<br />
          <strong>Naam:</strong> ${escapeHtml(order.payer_name)}<br />
          <strong>Betaald op:</strong> ${formatDate(order.paid_at || order.created_at)}<br />
          <strong>Aantal tafels:</strong> ${tableBookings.length}
        </p>
      </div>

      <!-- Table Bookings -->
      <h2 style="color: #0f172a; margin-bottom: 20px; font-size: 20px;">
        Jouw Tafelreservatie(s)
      </h2>
      ${tableRows}

      <!-- Important Notice -->
      <div style="background-color: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px; padding: 16px; margin-top: 32px;">
        <p style="color: #92400e; margin: 0; font-size: 14px; line-height: 1.6;">
          <strong>Belangrijk:</strong> Bewaar deze email met je reservatiecode(s).
          Je hebt deze nodig bij aankomst aan de deur.
          Je tafel wordt gereserveerd tot 30 minuten na de starttijd van het event.
        </p>
      </div>

    </div>

    <!-- Footer -->
    <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="color: #64748b; margin: 0; font-size: 14px; line-height: 1.6;">
        Met vriendelijke groeten,<br />
        <strong style="color: #0f172a;">${footerName}</strong>
      </p>
      ${footerEmail ? `<p style="color: #94a3b8; margin: 16px 0 0 0; font-size: 12px;">
        Voor vragen, neem contact met ons op via <a href="mailto:${footerEmail}" style="color: #0e7490; text-decoration: none;">${footerEmail}</a>
      </p>` : ''}
    </div>

  </div>
</body>
</html>
  `;
}

async function buildTicketEmail(order: any, event: any, tickets: any[], brand: any): Promise<string> {
  const qrCodes = await Promise.all(
    tickets.map(async (ticket) => {
      const qrData = ticket.qr_data || ticket.token || ticket.id;
      return {
        ticket,
        qrDataUrl: await generateQRCode(qrData),
      };
    })
  );

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const logoUrl = event.logo_url
    ? `${supabaseUrl}/storage/v1/object/public/${event.logo_url}`
    : 'https://i.imgur.com/placeholder.png';

  const BASE_URL = Deno.env.get('BASE_URL') || 'https://bizimevents.be';
  const eskilerLogoUrl = `${BASE_URL}/eskiler-logo-4.png`;

  const footerName = brand?.display_name || brand?.name || 'BizimEvents';
  const footerEmail = brand?.support_email || brand?.email || 'info@bizimevents.be';

  const ticketRows = qrCodes
    .map(
      ({ ticket, qrDataUrl }) => {
        const viewUrl = `${BASE_URL}/ticket-view?token=${ticket.public_token}`;
        const theme = ticket.ticket_types?.theme;
        const cardBg = theme?.card_bg || '#ffffff';
        const cardBorder = theme?.card_border || '#e2e8f0';
        const badgeText = theme?.badge_text || '';
        const badgeBg = theme?.badge_bg || '#D4AF37';
        const badgeTextColor = theme?.badge_text_color || '#1a1a1a';
        const headerBg = theme?.header_bg || '';
        const btnColor = headerBg && !headerBg.includes('gradient') ? headerBg : '#0e7490';

        const badgeHtml = badgeText ? `
      <div style="text-align: center; margin-bottom: 12px;">
        <span style="display: inline-block; background: ${badgeBg}; color: ${badgeTextColor}; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; padding: 4px 14px; border-radius: 20px; text-transform: uppercase;">
          ${badgeText}
        </span>
      </div>` : '';

        return `
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
        <strong style="color: #0f172a;">Naam:</strong> ${escapeHtml(ticket.holder_name)}<br />
        <strong style="color: #0f172a;">Email:</strong> ${escapeHtml(ticket.holder_email)}
      </p>
    </div>
  `;
      }
    )
    .join('');

  const allThemes = tickets.map(t => t.ticket_types?.theme).filter(Boolean);
  const uniqueThemes = new Set(allThemes.map(t => JSON.stringify(t)));
  const singleTheme = uniqueThemes.size === 1 ? allThemes[0] : null;
  const emailHeaderBg = singleTheme?.header_bg || 'linear-gradient(135deg, #0e7490 0%, #0369a1 100%)';
  const emailHeaderText = singleTheme?.header_text || '#ffffff';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Je tickets voor ${event.name}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background: ${emailHeaderBg}; padding: 40px 24px; text-align: center;">
      ${event.logo_url ? `<div style="margin-bottom: 20px;">
        <img src="${logoUrl}" alt="${event.name}" style="max-width: 200px; height: auto; display: inline-block;" />
      </div>` : ''}
      <h1 style="color: ${emailHeaderText}; margin: 0; font-size: 28px; font-weight: 700;">
        Je tickets voor ${event.name}
      </h1>
      <p style="color: ${emailHeaderText}; opacity: 0.85; margin: 12px 0 0 0; font-size: 16px;">
        Bedankt voor je aankoop bij BizimEvents
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

      <!-- Order Summary -->
      <div style="margin-bottom: 32px;">
        <h2 style="color: #0f172a; margin-bottom: 16px; font-size: 20px;">
          Ordernummer: ${order.order_number}
        </h2>
        <p style="color: #64748b; font-size: 14px; margin: 8px 0;">
          <strong>Email:</strong> ${escapeHtml(order.payer_email)}<br />
          <strong>Betaald op:</strong> ${formatDate(order.paid_at || order.created_at)}<br />
          <strong>Aantal tickets:</strong> ${tickets.length}
        </p>
      </div>

      <!-- Tickets with QR Codes -->
      <h2 style="color: #0f172a; margin-bottom: 20px; font-size: 20px;">
        Jouw Tickets
      </h2>
      ${ticketRows}

      <!-- Important Notice -->
      <div style="background-color: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px; padding: 16px; margin-top: 32px;">
        <p style="color: #92400e; margin: 0; font-size: 14px; line-height: 1.6;">
          <strong>Belangrijk:</strong> Vergeet dit ticket niet aan de ingang te tonen.
          Je kunt de QR-code op je telefoon laten zien of de tickets afdrukken.
          Elk ticket kan slechts een keer worden gescand.
        </p>
      </div>

    </div>

    <!-- Footer -->
    <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="color: #64748b; margin: 0; font-size: 14px; line-height: 1.6;">
        Met vriendelijke groeten,<br />
        <strong style="color: #0f172a;">${footerName}</strong>
      </p>
      ${footerEmail ? `<p style="color: #94a3b8; margin: 16px 0 0 0; font-size: 12px;">
        Voor vragen, neem contact met ons op via <a href="mailto:${footerEmail}" style="color: #0e7490; text-decoration: none;">${footerEmail}</a>
      </p>` : ''}
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

  // SECURITY: Diagnostic endpoint removed - was leaking API key prefix and internal config

  let orderId: string | null = null;
  let recipientEmail: string | null = null;

  try {
    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
    if (!authHeader) {
      console.error('AUTH: Missing Authorization header');
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing authorization header', code: 'MISSING_AUTH', details: 'Authorization header is required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      console.error('CRITICAL: RESEND_API_KEY is not configured!');
      throw new Error('RESEND_API_KEY not configured. Please set it in Supabase Dashboard -> Edge Functions -> Secrets');
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace('Bearer ', '');
    const isServiceRoleCall = token === supabaseServiceKey;
    const isAnonKeyCall = token === supabaseAnonKey;

    if (isServiceRoleCall) {
      // Service role key detected - internal webhook call
    } else if (isAnonKeyCall) {
      // SECURITY: Anon key calls are only allowed for resend requests from PaymentSuccess page.
      // We parse the body early to verify this is a resend request with a valid orderId.
      // The server-side rate limiter below (email_logs check) still applies.
    } else {
      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });

      const { data: { user }, error: authError } = await authClient.auth.getUser();

      if (authError || !user) {
        console.error('AUTH: Invalid token');
        return new Response(
          JSON.stringify({ ok: false, error: 'Invalid or expired token', code: 'INVALID_TOKEN' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // SECURITY: Only check active roles
      const { data: userRoles, error: rolesError } = await adminClient
        .from('user_roles')
        .select('role, event_id')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (rolesError) {
        console.error('ROLES: Error fetching roles');
      }

      const isSuperAdmin = userRoles?.some(r => r.role === 'superadmin' || r.role === 'super_admin');
      const isAdmin = userRoles?.some(r => r.role === 'admin' || r.role === 'organizer');

      if (!isSuperAdmin && !isAdmin) {
        console.error('AUTH: Insufficient permissions');
        return new Response(
          JSON.stringify({ ok: false, error: 'Insufficient permissions', code: 'FORBIDDEN' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const body: SendTicketEmailRequest = await req.json();
    const inputOrderId = body.orderId;
    const inputOrderNumber = body.orderNumber;
    const isResend = body.resend || false;
    const source = body.source || 'webhook';

    // SECURITY: Anon key calls can ONLY resend for a specific orderId (PaymentSuccess page)
    // Must also verify the order exists and is in a valid state to prevent enumeration
    if (isAnonKeyCall) {
      if (!isResend || !inputOrderId) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Unauthorized - resend with orderId required', code: 'FORBIDDEN' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify order exists and is paid (prevent order ID enumeration)
      const { data: anonOrder, error: anonOrderError } = await adminClient
        .from('orders')
        .select('id, status')
        .eq('id', inputOrderId)
        .maybeSingle();

      if (anonOrderError || !anonOrder || !['paid', 'comped'].includes(anonOrder.status)) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Order not found', code: 'NOT_FOUND' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    let orderIdentifier = inputOrderId || inputOrderNumber;

    if (!orderIdentifier) {
      console.error('VALIDATION: Missing order identifier');
      return new Response(
        JSON.stringify({ ok: false, error: 'Order ID or Order Number is required', code: 'MISSING_ORDER_IDENTIFIER' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isUUID = isValidUUID(orderIdentifier);

    let query = adminClient.from('orders').select('*');
    if (isUUID) {
      query = query.eq('id', orderIdentifier);
    } else {
      query = query.eq('order_number', orderIdentifier);
    }

    const { data: order, error: orderError } = await query.maybeSingle();

    if (orderError) {
      console.error('ORDER: Database error -', orderError.message);
      return new Response(
        JSON.stringify({ ok: false, error: 'Failed to fetch order', code: 'DATABASE_ERROR', details: orderError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!order) {
      console.error('ORDER: Not found -', orderIdentifier);
      return new Response(
        JSON.stringify({ ok: false, error: `Order not found: ${orderIdentifier}`, code: 'ORDER_NOT_FOUND' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    orderId = order.id;
    recipientEmail = order.payer_email;

    if (order.status !== 'paid' && order.status !== 'comped') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Order is not paid', code: 'ORDER_NOT_PAID', details: `Status: ${order.status}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (order.status === 'paid' && !order.paid_at && !isResend) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Order paid_at is null', code: 'MISSING_PAID_AT' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (order.email_sent && !isResend) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Email already sent. Use resend=true to send again.', code: 'ALREADY_SENT' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (isResend && source !== 'superadmin') {
      // Rate limit per order: max 1 resend per 5 minutes
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: recentEmails } = await adminClient
        .from('email_logs')
        .select('created_at')
        .eq('order_id', orderId)
        .eq('status', 'sent')
        .gte('created_at', fiveMinutesAgo)
        .order('created_at', { ascending: false });

      if (recentEmails && recentEmails.length > 0) {
        const lastSentAt = new Date(recentEmails[0].created_at);
        const minutesAgo = Math.floor((Date.now() - lastSentAt.getTime()) / 60000);
        return new Response(
          JSON.stringify({ ok: false, error: `Please wait ${5 - minutesAgo} more minutes before resending.`, code: 'RATE_LIMIT' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // SECURITY: Rate limit per email address across ALL orders (max 5 resends per hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recentEmailsForAddress } = await adminClient
        .from('email_logs')
        .select('created_at')
        .eq('recipient_email', order.payer_email)
        .eq('status', 'sent')
        .gte('created_at', oneHourAgo);

      if (recentEmailsForAddress && recentEmailsForAddress.length >= 5) {
        console.warn(`[SECURITY] Email rate limit hit for address: ${order.payer_email} (${recentEmailsForAddress.length} emails in last hour)`);
        return new Response(
          JSON.stringify({ ok: false, error: 'Too many emails sent to this address. Please try again later.', code: 'RATE_LIMIT' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const { data: event, error: eventError } = await adminClient
      .from('events')
      .select('*')
      .eq('id', order.event_id)
      .single();

    if (eventError || !event) {
      console.error('EVENT: Not found -', eventError?.message);
      return new Response(
        JSON.stringify({ ok: false, error: 'Event not found', code: 'EVENT_NOT_FOUND', details: eventError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let brand = null;
    if (event.brand_slug) {
      const { data: brandData } = await adminClient
        .from('brands')
        .select('*')
        .eq('slug', event.brand_slug)
        .maybeSingle();
      brand = brandData;
    }

    // FIX: Include both 'valid' AND 'used' tickets for resends
    // This ensures customers can get their tickets resent even if some have been scanned
    const ticketStatuses = isResend ? ['valid', 'used'] : ['valid'];

    const { data: tickets, error: ticketsError } = await adminClient
      .from('tickets')
      .select('*, ticket_types(*)')
      .eq('order_id', orderId)
      .in('status', ticketStatuses);

    if (ticketsError) {
      console.error('TICKETS: Error -', ticketsError.message);
    }

    const { data: tableBookings, error: bookingsError } = await adminClient
      .from('table_bookings')
      .select('*, floorplan_tables(*)')
      .eq('order_id', orderId)
      .in('status', ['PAID', 'PENDING']);

    if (bookingsError) {
      console.error('TABLE_BOOKINGS: Error -', bookingsError.message);
    }

    const hasTickets = tickets && tickets.length > 0;
    const hasTableBookings = tableBookings && tableBookings.length > 0;

    if (!hasTickets && !hasTableBookings) {
      console.error('ITEMS: No tickets or table bookings found for order:', orderId);
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'No tickets or table bookings found for this order',
          code: 'NO_ITEMS',
          details: `Order ${order.order_number} has no valid/used tickets or active table bookings`
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let recipientEmailResolved = order.payer_email;
    if (hasTickets) {
      const ticketWithEmail = tickets.find(t => t.holder_email && t.holder_email.trim() !== '');
      if (ticketWithEmail) recipientEmailResolved = ticketWithEmail.holder_email;
    } else if (hasTableBookings) {
      const bookingWithEmail = tableBookings.find(b => b.customer_email && b.customer_email.trim() !== '');
      if (bookingWithEmail) recipientEmailResolved = bookingWithEmail.customer_email;
    }

    recipientEmail = recipientEmailResolved;

    if (!recipientEmailResolved || recipientEmailResolved.trim() === '') {
      console.error('RECIPIENT: No valid email found');
      return new Response(
        JSON.stringify({ ok: false, error: 'No valid recipient email found', code: 'NO_RECIPIENT_EMAIL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let html: string;
    let emailSubject: string;

    if (hasTableBookings) {
      html = await buildTableReservationEmail(order, event, tableBookings, brand);
      emailSubject = `Je tafelreservatie voor ${event.name}`;
    } else {
      html = await buildTicketEmail(order, event, tickets, brand);
      emailSubject = `Je tickets voor ${event.name}`;
    }

    let pdfAttachments: { filename: string; content: string }[] = [];
    if (hasTickets && tickets.length > 0) {
      try {
        const pdfBase64 = await buildTicketPdf(order, event, tickets);
        pdfAttachments = [{ filename: 'tickets.pdf', content: pdfBase64 }];
      } catch (pdfErr: any) {
        console.error('PDF: Generation failed, sending without attachment:', pdfErr.message);
      }
    }

    const emailResult = await sendEmail({
      to: recipientEmailResolved,
      subject: emailSubject,
      html,
      attachments: pdfAttachments.length > 0 ? pdfAttachments : undefined,
    });

    await adminClient
      .from('orders')
      .update({
        email_sent: true,
        email_sent_at: new Date().toISOString(),
        email_error: null,
      })
      .eq('id', orderId);

    await adminClient
      .from('email_logs')
      .insert({
        order_id: orderId,
        status: 'sent',
        provider: 'resend',
        recipient_email: recipientEmailResolved,
        provider_message_id: emailResult.id,
      });

    return new Response(
      JSON.stringify({
        ok: true,
        message: hasTableBookings ? 'Table reservation confirmation sent successfully' : 'Tickets sent successfully',
        order_id: orderId,
        recipient: recipientEmailResolved,
        ticket_count: hasTickets ? tickets.length : 0,
        table_count: hasTableBookings ? tableBookings.length : 0,
        type: hasTableBookings ? 'table_reservation' : 'tickets',
        email_id: emailResult.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('========================================');
    console.error('ERROR:', error.message);
    console.error('Stack:', error.stack);
    console.error('========================================');

    if (orderId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const adminClient = createClient(supabaseUrl, supabaseServiceKey);

        await adminClient
          .from('orders')
          .update({ email_error: error.message })
          .eq('id', orderId);

        if (recipientEmail) {
          await adminClient
            .from('email_logs')
            .insert({
              order_id: orderId,
              status: 'failed',
              provider: 'resend',
              recipient_email: recipientEmail,
              error_message: error.message,
            });
        }
      } catch (logError) {
        console.error('Failed to log error:', logError.message);
      }
    }

    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message || 'Internal server error',
        code: 'EMAIL_SEND_FAILED',
        details: 'Check edge function logs for more information',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
