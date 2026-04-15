import { createClient } from 'npm:@supabase/supabase-js@2';
import { Resend } from 'npm:resend@4.0.0';
import { PDFDocument, rgb, StandardFonts } from 'npm:pdf-lib@1.17.1';
import QRCode from 'npm:qrcode@1.5.4';
import { getCorsHeaders } from "../_shared/cors.ts";

interface ResendTicketRequest {
  ticket_id: string;
}

function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('nl-BE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Europe/Brussels',
  });
}

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString('nl-BE', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels',
  });
}

async function generateQRCode(data: string): Promise<string> {
  try { return await QRCode.toDataURL(data, { width: 300, margin: 2 }); } catch { return ''; }
}

function drawQROnPage(page: any, qrData: string, x: number, y: number, size: number) {
  const qrCode = QRCode.create(qrData, { errorCorrectionLevel: 'M' });
  const modules = qrCode.modules;
  const moduleCount = modules.size;
  const margin = 2;
  const totalModules = moduleCount + margin * 2;
  const cellSize = size / totalModules;

  page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1) });

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (modules.get(row, col)) {
        page.drawRectangle({
          x: x + (col + margin) * cellSize,
          y: y + size - (row + margin + 1) * cellSize,
          width: cellSize, height: cellSize, color: rgb(0, 0, 0),
        });
      }
    }
  }
}

function centerText(text: string, font: any, size: number, pageWidth: number): number {
  return (pageWidth - font.widthOfTextAtSize(text, size)) / 2;
}

async function buildTicketPdf(order: any, event: any, tickets: any[]): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (const ticket of tickets) {
    const page = pdfDoc.addPage([595, 842]);
    const { width, height } = page.getSize();
    let y = height - 50;

    page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: rgb(0.02, 0.59, 0.41) });
    const brandText = 'STAGENATION';
    page.drawText(brandText, { x: centerText(brandText, boldFont, 26, width), y: height - 38, size: 26, font: boldFont, color: rgb(1, 1, 1) });
    const subText = 'TOEGANGSTICKET';
    page.drawText(subText, { x: centerText(subText, font, 12, width), y: height - 58, size: 12, font, color: rgb(1, 1, 1) });

    y = height - 110;

    page.drawText(event.name || 'Event', { x: 50, y, size: 20, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
    y -= 22;

    if (event.start_date) {
      page.drawText(formatDate(event.start_date), { x: 50, y, size: 11, font, color: rgb(0.3, 0.3, 0.3) });
      y -= 16;
      page.drawText('Tijd: ' + formatTime(event.start_date), { x: 50, y, size: 11, font, color: rgb(0.3, 0.3, 0.3) });
      y -= 16;
    }
    if (event.location) {
      page.drawText(event.location, { x: 50, y, size: 11, font, color: rgb(0.3, 0.3, 0.3) });
      y -= 22;
    }

    page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
    y -= 22;

    const details = [
      { label: 'Ordernummer:', value: order.order_number || '' },
      { label: 'Ticket:', value: ticket.ticket_types?.name || 'Ticket' },
      { label: 'Ticketnummer:', value: ticket.ticket_number || '' },
      { label: 'Naam:', value: ticket.holder_name || order.payer_name || '' },
      { label: 'E-mail:', value: ticket.holder_email || order.payer_email || '' },
    ];

    for (const d of details) {
      if (!d.value) continue;
      page.drawText(d.label, { x: 50, y, size: 10, font: boldFont, color: rgb(0.2, 0.2, 0.2) });
      page.drawText(String(d.value), { x: 160, y, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
      y -= 16;
    }

    y -= 10;
    page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
    y -= 20;

    const qrData = ticket.qr_code || ticket.qr_data || ticket.public_token || ticket.id;
    if (qrData) {
      try {
        const qrSize = 160;
        drawQROnPage(page, qrData, (width - qrSize) / 2, y - qrSize, qrSize);
        y -= qrSize + 14;
      } catch (e: any) {
        console.error('[pdf] QR draw failed:', e.message);
      }
    }

    const footerText = 'Toon deze QR-code bij de ingang. Elk ticket kan slechts 1x gescand worden.';
    page.drawText(footerText, { x: centerText(footerText, font, 8, width), y, size: 8, font, color: rgb(0.47, 0.47, 0.47) });

    page.drawText('StageNation | Powered by Lumetrix', { x: centerText('StageNation | Powered by Lumetrix', font, 8, width), y: 30, size: 8, font, color: rgb(0.6, 0.6, 0.6) });
  }

  const pdfBytes = await pdfDoc.save();
  let binary = '';
  for (let i = 0; i < pdfBytes.length; i++) binary += String.fromCharCode(pdfBytes[i]);
  return btoa(binary);
}

function buildSingleTicketEmail(ticket: any, event: any, order: any): string {
  const qrData = ticket.qr_code || ticket.qr_data || ticket.public_token || ticket.id;
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
          ${escapeHtml(badgeText)}
        </span>
      </div>` : '';

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Je ticket voor ${escapeHtml(event.name)}</title></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1);">
    <div style="background: ${headerBg}; padding: 40px 24px; text-align: center;">
      <h1 style="color: ${headerText}; margin: 0; font-size: 28px; font-weight: 700;">Je ticket voor ${escapeHtml(event.name)}</h1>
      <p style="color: ${headerText}; opacity: 0.85; margin: 12px 0 0 0; font-size: 16px;">Bedankt voor je aankoop bij StageNation</p>
    </div>
    <div style="padding: 32px 24px;">
      <div style="background-color: #f1f5f9; border-left: 4px solid #0e7490; padding: 20px; margin-bottom: 32px; border-radius: 8px;">
        <h2 style="color: #0f172a; margin-top: 0; margin-bottom: 16px; font-size: 20px;">Event Details</h2>
        <p style="color: #475569; margin: 8px 0; font-size: 15px; line-height: 1.6;">
          <strong style="color: #0f172a;">Locatie:</strong> ${escapeHtml(event.location || '')}
          ${event.location_address ? `<br /><span style="color: #64748b; font-size: 14px;">${escapeHtml(event.location_address)}</span>` : ''}<br />
          <strong style="color: #0f172a;">Datum:</strong> ${formatDate(event.start_date)}<br />
          <strong style="color: #0f172a;">Tijd:</strong> ${formatTime(event.start_date)}
        </p>
      </div>
      <div style="background-color: ${cardBg}; border: 2px solid ${cardBorder}; border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        ${badgeHtml}
        <h3 style="color: #0f172a; margin-top: 0; margin-bottom: 16px; font-size: 18px; text-align: center;">${escapeHtml(ticket.ticket_types?.name || 'Ticket')}</h3>
        <div style="background-color: #f1f5f9; border-radius: 8px; padding: 16px; margin: 16px 0; text-align: center;">
          <p style="color: #64748b; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">Ticket Nummer</p>
          <p style="color: #0f172a; font-size: 18px; font-weight: 700; margin: 0; font-family: 'Courier New', monospace; letter-spacing: 1px;">${escapeHtml(ticket.ticket_number)}</p>
        </div>
        <div style="text-align: center; margin: 12px 0; padding: 12px; background-color: #f8fafc; border-radius: 6px;">
          <p style="color: #64748b; font-size: 12px; margin: 0 0 8px 0;">Open je ticket met QR code:</p>
          <a href="${viewUrl}" style="display: inline-block; background-color: ${btnColor}; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 6px; font-size: 14px; font-weight: 600;">Open ticket</a>
        </div>
        <p style="color: #64748b; font-size: 14px; margin: 12px 0; text-align: center;">
          <strong style="color: #0f172a;">Naam:</strong> ${escapeHtml(ticket.holder_name || '')}<br />
          <strong style="color: #0f172a;">Email:</strong> ${escapeHtml(ticket.holder_email || '')}
        </p>
      </div>
      <div style="background-color: #dcfce7; border: 2px solid #16a34a; border-radius: 12px; padding: 24px; margin-bottom: 32px; text-align: center;">
        <h3 style="color: #15803d; margin: 0 0 8px 0; font-size: 18px; font-weight: 600;">PDF Ticket in bijlage</h3>
        <p style="color: #166534; font-size: 14px; margin: 0;">Open de bijgevoegde PDF om je ticket met QR code te bekijken. Je kan de PDF printen of op je telefoon bewaren.</p>
      </div>
      <div style="background-color: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px; padding: 16px; margin-top: 32px;">
        <p style="color: #92400e; margin: 0; font-size: 14px; line-height: 1.6;">
          <strong>Belangrijk:</strong> Vergeet dit ticket niet aan de ingang te tonen. Je kunt de QR-code op je telefoon laten zien of het ticket afdrukken. Dit ticket kan slechts een keer worden gescand.
        </p>
      </div>
    </div>
    <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="color: #64748b; margin: 0; font-size: 14px; line-height: 1.6;">Met vriendelijke groeten,<br /><strong style="color: #0f172a;">StageNation</strong></p>
      <p style="color: #94a3b8; margin: 16px 0 0 0; font-size: 12px;">Voor vragen, neem contact met ons op via <a href="mailto:tickets@stagenation.be" style="color: #0e7490; text-decoration: none;">tickets@stagenation.be</a></p>
    </div>
  </div>
</body></html>`;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
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

    if (!resendApiKey) throw new Error('RESEND_API_KEY not configured');

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
      .eq('user_id', user.id)
      .eq('is_active', true);

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

    const html = buildSingleTicketEmail(ticket, event, order);
    const emailSubject = `Je ticket voor ${event.name}`;

    let pdfAttachment: { filename: string; content: string } | null = null;
    try {
      const pdfBase64 = await buildTicketPdf(order, event, [ticket]);
      pdfAttachment = {
        filename: `StageNation-Ticket-${ticket.ticket_number || 'ticket'}.pdf`,
        content: pdfBase64,
      };
    } catch (pdfErr: any) {
      console.error('[pdf] PDF generation failed, sending without attachment:', pdfErr.message);
    }

    const resend = new Resend(resendApiKey);
    const emailFrom = Deno.env.get('EMAIL_FROM') || 'StageNation Tickets <tickets@lumetrix.be>';

    const emailPayload: any = {
      from: emailFrom,
      to: [recipientEmail],
      reply_to: 'tickets@stagenation.be',
      subject: emailSubject,
      html,
    };

    if (pdfAttachment) {
      emailPayload.attachments = [{
        filename: pdfAttachment.filename,
        content: pdfAttachment.content,
      }];
    }

    const result = await resend.emails.send(emailPayload);

    if (result?.error) {
      throw new Error(`Resend API error: ${result.error.message || JSON.stringify(result.error)}`);
    }

    const emailId = result?.data?.id || result?.id;

    await adminClient
      .from('email_logs')
      .insert({
        order_id: order.id,
        ticket_id: ticket_id,
        event_id: event.id,
        recipient_email: recipientEmail,
        status: 'sent',
        subject: emailSubject,
        provider_message_id: emailId || null,
        template: 'resend_single_ticket',
      });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Email with PDF sent successfully',
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
