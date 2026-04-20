import { createClient } from 'npm:@supabase/supabase-js@2';
import { Resend } from 'npm:resend@4.0.0';
import QRCode from 'npm:qrcode@1.5.4';
import { PDFDocument, rgb, StandardFonts } from 'npm:pdf-lib@1.17.1';
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
  try {
    return await QRCode.toDataURL(data, { width: 300, margin: 2 });
  } catch {
    return '';
  }
}

async function sendEmail({ to, subject, html, attachments }: { to: string; subject: string; html: string; attachments?: { filename: string; content: string }[] }): Promise<{ id: string }> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const emailFrom = Deno.env.get('EMAIL_FROM') || 'StageNation Tickets <tickets@lumetrix.be>';

  if (!resendApiKey) {
    console.error('CRITICAL: RESEND_API_KEY is not configured!');
    throw new Error('Email service not configured - RESEND_API_KEY missing');
  }

  const resend = new Resend(resendApiKey);

  try {
    const emailPayload: any = {
      from: emailFrom,
      to: [to],
      reply_to: 'tickets@stagenation.be',
      subject,
      html,
    };
    if (attachments && attachments.length > 0) {
      emailPayload.attachments = attachments.map(a => ({
        filename: a.filename,
        content: a.content,
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
function escapeHtml(str: unknown): string {
  if (str == null) return '';
  const s = String(str);
  if (!s) return '';
  return s
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
          width: cellSize,
          height: cellSize,
          color: rgb(0, 0, 0),
        });
      }
    }
  }
}

function centerText(text: string, font: any, size: number, pageWidth: number): number {
  const w = font.widthOfTextAtSize(text, size);
  return (pageWidth - w) / 2;
}

async function buildTicketPdf(order: any, event: any, tickets: any[]): Promise<string> {
  console.log('[pdf] buildTicketPdf start, tickets:', tickets?.length);
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

    const eventName = event.name || 'Event';
    page.drawText(eventName, { x: 50, y, size: 20, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
    y -= 22;

    if (event.start_date) {
      page.drawText(formatDate(event.start_date), { x: 50, y, size: 11, font, color: rgb(0.3, 0.3, 0.3) });
      y -= 16;
      page.drawText('Tijd: ' + formatTime(event.start_date), { x: 50, y, size: 11, font, color: rgb(0.3, 0.3, 0.3) });
      y -= 16;
    }
    const location = event.location || '';
    if (location) {
      page.drawText(location, { x: 50, y, size: 11, font, color: rgb(0.3, 0.3, 0.3) });
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
  console.log('[pdf] buildTicketPdf done, size:', pdfBytes.length);
  let binary = '';
  for (let i = 0; i < pdfBytes.length; i++) binary += String.fromCharCode(pdfBytes[i]);
  return btoa(binary);
}

async function buildSeatTicketPdf(order: any, event: any, seatTickets: any[]): Promise<string> {
  console.log('[pdf] buildSeatTicketPdf start, tickets:', seatTickets?.length);
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const monoFont = await pdfDoc.embedFont(StandardFonts.CourierBold);

  for (const ts of seatTickets) {
    const sectionName = ts.seats?.seat_sections?.name || '';
    const rowLabel = ts.seats?.row_label || '-';
    const seatNumber = String(ts.seats?.seat_number ?? '-');
    const pricePaid = parseFloat(ts.price_paid || 0).toFixed(2);
    const ticketCode = ts.ticket_code || '';
    const seatType = ts.seats?.seat_type || 'regular';

    const page = pdfDoc.addPage([595, 842]);
    const { width, height } = page.getSize();
    let y = height - 50;

    page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: rgb(0.02, 0.59, 0.41) });
    const brandText = 'STAGENATION';
    page.drawText(brandText, { x: centerText(brandText, boldFont, 26, width), y: height - 38, size: 26, font: boldFont, color: rgb(1, 1, 1) });
    const subText = 'TOEGANGSTICKET';
    page.drawText(subText, { x: centerText(subText, font, 12, width), y: height - 58, size: 12, font, color: rgb(1, 1, 1) });

    y = height - 110;

    const eventName = event.name || 'Event';
    page.drawText(eventName, { x: 50, y, size: 20, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
    y -= 22;

    if (event.start_date) {
      const dateTime = formatDate(event.start_date) + '  -  ' + formatTime(event.start_date);
      page.drawText(dateTime, { x: 50, y, size: 11, font, color: rgb(0.3, 0.3, 0.3) });
      y -= 16;
    }
    const venue = [event.venue_name, event.location].filter(Boolean).join(', ');
    if (venue) {
      page.drawText(venue, { x: 50, y, size: 11, font, color: rgb(0.3, 0.3, 0.3) });
      y -= 22;
    }

    page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
    y -= 24;

    const col1 = 50;
    const col2 = 180;
    const col3 = 280;
    const col4 = 400;

    page.drawText('SECTIE', { x: col1, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
    page.drawText('RIJ', { x: col2, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
    page.drawText('STOEL', { x: col3, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
    page.drawText('PRIJS', { x: col4, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
    y -= 18;

    page.drawText(sectionName, { x: col1, y, size: 16, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(rowLabel, { x: col2, y, size: 16, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(seatNumber, { x: col3, y, size: 16, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
    page.drawText('EUR ' + pricePaid, { x: col4, y, size: 16, font: boldFont, color: rgb(0.1, 0.1, 0.1) });

    if (seatType === 'vip') {
      page.drawText('VIP', { x: width - 80, y: y + 18, size: 10, font: boldFont, color: rgb(0.7, 0.47, 0) });
    }
    y -= 30;

    if (ticketCode) {
      page.drawText('TICKET CODE', { x: 50, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
      y -= 20;
      page.drawText(ticketCode, { x: 50, y, size: 18, font: monoFont, color: rgb(0.1, 0.1, 0.1) });
      y -= 30;
    }

    page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
    y -= 20;

    const qrValue = ts.qr_data || ts.qr_code || ticketCode || ts.id;
    if (qrValue) {
      try {
        const qrSize = 160;
        drawQROnPage(page, qrValue, (width - qrSize) / 2, y - qrSize, qrSize);
        y -= qrSize + 14;
      } catch (e: any) {
        console.error('[pdf] QR draw failed:', e.message);
      }
    }

    page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
    y -= 16;

    page.drawText('Bestelnummer: ' + (order.order_number || ''), { x: 50, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    y -= 14;
    page.drawText('Naam: ' + (order.payer_name || ''), { x: 50, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    y -= 14;
    page.drawText('E-mail: ' + (order.payer_email || ''), { x: 50, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    y -= 20;

    page.drawText('Dit ticket is uniek en kan slechts een keer gescand worden.', { x: 50, y, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
    y -= 12;
    page.drawText('Toon dit ticket bij de ingang op je telefoon of geprint.', { x: 50, y, size: 8, font, color: rgb(0.5, 0.5, 0.5) });

    page.drawText('StageNation | Powered by Lumetrix', { x: centerText('StageNation | Powered by Lumetrix', font, 8, width), y: 30, size: 8, font, color: rgb(0.6, 0.6, 0.6) });
  }

  const pdfBytes = await pdfDoc.save();
  console.log('[pdf] buildSeatTicketPdf done, size:', pdfBytes.length);
  let binary = '';
  for (let i = 0; i < pdfBytes.length; i++) binary += String.fromCharCode(pdfBytes[i]);
  return btoa(binary);
}

async function buildTableReservationEmail(order: any, event: any, tableBookings: any[], brand: any): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const logoUrl = event.logo_url
    ? `${supabaseUrl}/storage/v1/object/public/${event.logo_url}`
    : 'https://i.imgur.com/placeholder.png';

  const BASE_URL = Deno.env.get('BASE_URL') || 'https://stagenation.be';
  const brandLogoUrl = `${BASE_URL}/stagenation-logo.webp`;

  const footerName = brand?.display_name || brand?.name || 'StageNation';
  const footerEmail = brand?.support_email || brand?.email || 'tickets@stagenation.be';

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
        Tafel ${escapeHtml(String(booking.floorplan_tables?.table_number || 'N/A'))}
      </h3>
      <div style="text-align: center; margin: 20px 0;">
        <img src="${qrDataUrl}" width="220" height="220" alt="QR Code ${escapeHtml(booking.booking_code)}" style="display: block; margin: 0 auto; width: 220px; height: 220px; border: 1px solid #cbd5e1; border-radius: 8px;" />
      </div>
      <div style="background-color: #f1f5f9; border-radius: 8px; padding: 16px; margin: 16px 0; text-align: center;">
        <p style="color: #64748b; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">
          Reservatiecode
        </p>
        <p style="color: #0f172a; font-size: 18px; font-weight: 700; margin: 0; font-family: 'Courier New', monospace; letter-spacing: 1px;">
          ${escapeHtml(booking.booking_code)}
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
  <title>Je tafelreservatie voor ${escapeHtml(event.name)}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, #0e7490 0%, #0369a1 100%); padding: 40px 24px; text-align: center;">
      ${event.logo_url ? `<div style="margin-bottom: 20px;">
        <img src="${logoUrl}" alt="${escapeHtml(event.name)}" style="max-width: 200px; height: auto; display: inline-block;" />
      </div>` : ''}
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">
        Je tafelreservatie voor ${escapeHtml(event.name)}
      </h1>
      <p style="color: #e0f2fe; margin: 12px 0 0 0; font-size: 16px;">
        Bedankt voor je reservatie bij StageNation
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
          <strong style="color: #0f172a;">Locatie:</strong> ${escapeHtml(event.location || '')}<br />
          ${event.location_address ? `<span style="color: #64748b; font-size: 14px;">${escapeHtml(event.location_address)}</span><br />` : ''}
          <strong style="color: #0f172a;">Datum:</strong> ${formatDate(event.start_date)}<br />
          <strong style="color: #0f172a;">Tijd:</strong> ${formatTime(event.start_date)}
        </p>
      </div>

      <!-- Order Summary -->
      <div style="margin-bottom: 32px;">
        <h2 style="color: #0f172a; margin-bottom: 16px; font-size: 20px;">
          Ordernummer: ${escapeHtml(order.order_number)}
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
        <strong style="color: #0f172a;">${escapeHtml(footerName)}</strong>
      </p>
      ${footerEmail ? `<p style="color: #94a3b8; margin: 16px 0 0 0; font-size: 12px;">
        Voor vragen, neem contact met ons op via <a href="mailto:${escapeHtml(footerEmail)}" style="color: #0e7490; text-decoration: none;">${escapeHtml(footerEmail)}</a>
      </p>` : ''}
    </div>

  </div>
</body>
</html>
  `;
}

async function buildSeatOrderEmail(order: any, event: any, seatTickets: any[], brand: any): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const logoUrl = event.logo_url
    ? `${supabaseUrl}/storage/v1/object/public/${event.logo_url}`
    : '';

  const BASE_URL = Deno.env.get('BASE_URL') || 'https://stagenation.be';
  const footerName = brand?.display_name || brand?.name || 'StageNation';
  const footerEmail = brand?.support_email || brand?.email || 'tickets@stagenation.be';

  const seatQrCodes = await Promise.all(
    seatTickets.map(async (ts: any) => {
      const qrData = ts.qr_data || ts.ticket_code || ts.id;
      return { ts, qrDataUrl: await generateQRCode(qrData) };
    })
  );

  const totalCents = order.total_amount || 0;
  const totalEuros = (totalCents / 100).toFixed(2);
  const serviceFeeCents = order.service_fee_total_cents || 0;
  const serviceFeeEuros = (serviceFeeCents / 100).toFixed(2);
  const subtotalEuros = ((totalCents - serviceFeeCents) / 100).toFixed(2);

  const seatRows = seatQrCodes.map(({ ts, qrDataUrl }) => {
    const sectionName = ts.seats?.seat_sections?.name || '';
    const rowLabel = ts.seats?.row_label || '-';
    const seatNumber = ts.seats?.seat_number || '-';
    const pricePaid = parseFloat(ts.price_paid || 0).toFixed(2);
    const ticketCode = ts.ticket_code || '-';

    return `
    <div style="background-color: #ffffff; border: 2px solid #e2e8f0; border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
      <h3 style="color: #0f172a; margin-top: 0; margin-bottom: 4px; font-size: 18px; text-align: center;">
        ${escapeHtml(sectionName)}
      </h3>
      <p style="color: #475569; font-size: 14px; margin: 0 0 16px; text-align: center;">
        Rij ${escapeHtml(rowLabel)} &mdash; Stoel ${escapeHtml(seatNumber)}
      </p>
      <div style="text-align: center; margin: 20px 0;">
        <img src="${qrDataUrl}" width="220" height="220" alt="QR Code ${escapeHtml(ticketCode)}" style="display: block; margin: 0 auto; width: 220px; height: 220px; border: 1px solid #cbd5e1; border-radius: 8px;" />
      </div>
      <div style="background-color: #f1f5f9; border-radius: 8px; padding: 16px; margin: 16px 0; text-align: center;">
        <p style="color: #64748b; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">
          Ticket Code
        </p>
        <p style="color: #0f172a; font-size: 18px; font-weight: 700; margin: 0; font-family: 'Courier New', monospace; letter-spacing: 1px;">
          ${escapeHtml(ticketCode)}
        </p>
      </div>
      <p style="color: #64748b; font-size: 14px; margin: 12px 0; text-align: center;">
        <strong style="color: #0f172a;">Prijs:</strong> EUR ${pricePaid}
      </p>
    </div>`;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Je tickets voor ${escapeHtml(event.name)}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1);">

    <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 40px 24px; text-align: center;">
      ${event.logo_url ? `<div style="margin-bottom: 20px;"><img src="${logoUrl}" alt="${escapeHtml(event.name)}" style="max-width: 200px; height: auto; display: inline-block;" /></div>` : ''}
      <div style="width: 60px; height: 60px; background-color: rgba(255,255,255,0.2); border-radius: 50%; margin: 0 auto 16px; line-height: 60px; font-size: 30px; color: #ffffff;">&#10003;</div>
      <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700;">Betaling Geslaagd!</h1>
      <p style="color: rgba(255,255,255,0.85); margin: 12px 0 0 0; font-size: 16px;">
        Je tickets voor ${escapeHtml(event.name)}
      </p>
    </div>

    <div style="padding: 32px 24px;">

      <div style="background-color: #f1f5f9; border-left: 4px solid #059669; padding: 20px; margin-bottom: 32px; border-radius: 8px;">
        <h2 style="color: #0f172a; margin-top: 0; margin-bottom: 16px; font-size: 20px;">Event Details</h2>
        <p style="color: #475569; margin: 8px 0; font-size: 15px; line-height: 1.6;">
          <strong style="color: #0f172a;">Locatie:</strong> ${escapeHtml(event.venue_name || event.location || '')}<br />
          ${event.location_address ? `<span style="color: #64748b; font-size: 14px;">${escapeHtml(event.location_address)}</span><br />` : ''}
          <strong style="color: #0f172a;">Datum:</strong> ${formatDate(event.start_date)}<br />
          <strong style="color: #0f172a;">Tijd:</strong> ${formatTime(event.start_date)}
        </p>
      </div>

      <div style="background-color: #f9fafb; border-radius: 12px; padding: 20px; margin-bottom: 32px;">
        <h2 style="color: #0f172a; margin-top: 0; margin-bottom: 16px; font-size: 20px;">Bestelgegevens</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Bestelnummer:</td>
            <td style="padding: 8px 0; color: #0f172a; font-size: 14px; font-weight: bold; text-align: right; font-family: 'Courier New', monospace;">${escapeHtml(order.order_number)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Naam:</td>
            <td style="padding: 8px 0; color: #0f172a; font-size: 14px; text-align: right;">${escapeHtml(order.payer_name || '')}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">E-mail:</td>
            <td style="padding: 8px 0; color: #0f172a; font-size: 14px; text-align: right;">${escapeHtml(order.payer_email)}</td>
          </tr>
        </table>
      </div>

      <h2 style="color: #0f172a; margin-bottom: 20px; font-size: 20px;">Jouw Stoelen</h2>
      ${seatRows}

      <div style="background-color: #f9fafb; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Subtotaal:</td>
            <td style="padding: 6px 0; color: #0f172a; font-size: 14px; text-align: right;">EUR ${subtotalEuros}</td>
          </tr>
          ${serviceFeeCents > 0 ? `<tr>
            <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Servicekosten:</td>
            <td style="padding: 6px 0; color: #0f172a; font-size: 14px; text-align: right;">EUR ${serviceFeeEuros}</td>
          </tr>` : ''}
          <tr>
            <td style="padding: 10px 0 0; color: #0f172a; font-size: 18px; font-weight: bold; border-top: 2px solid #e5e7eb;">Totaal:</td>
            <td style="padding: 10px 0 0; color: #059669; font-size: 18px; font-weight: bold; text-align: right; border-top: 2px solid #e5e7eb;">EUR ${totalEuros}</td>
          </tr>
        </table>
      </div>

      ${order.verification_code ? `
      <div style="background-color: #eff6ff; border-radius: 12px; padding: 16px; margin-bottom: 24px; text-align: center;">
        <p style="margin: 0 0 4px; color: #6b7280; font-size: 12px;">Verificatiecode (bewaar voor klantenservice)</p>
        <p style="margin: 0; font-size: 24px; font-weight: bold; font-family: 'Courier New', monospace; color: #1e40af; letter-spacing: 4px;">${escapeHtml(order.verification_code)}</p>
      </div>` : ''}

      <div style="background-color: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px; padding: 16px; margin-top: 32px;">
        <p style="color: #92400e; margin: 0; font-size: 14px; line-height: 1.6;">
          <strong>Belangrijk:</strong> Toon je QR-code(s) bij de ingang op je telefoon of print ze uit.
          Elk ticket kan slechts een keer worden gescand. Bewaar deze e-mail als bewijs van aankoop.
        </p>
      </div>

    </div>

    <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="color: #64748b; margin: 0; font-size: 14px; line-height: 1.6;">
        Met vriendelijke groeten,<br />
        <strong style="color: #0f172a;">${escapeHtml(footerName)}</strong>
      </p>
      ${footerEmail ? `<p style="color: #94a3b8; margin: 16px 0 0 0; font-size: 12px;">
        Voor vragen, neem contact met ons op via <a href="mailto:${escapeHtml(footerEmail)}" style="color: #059669; text-decoration: none;">${escapeHtml(footerEmail)}</a>
      </p>` : ''}
    </div>

  </div>
</body>
</html>`;
}

async function buildTicketEmail(order: any, event: any, tickets: any[], brand: any): Promise<string> {
  const qrCodes = await Promise.all(
    tickets.map(async (ticket) => {
      const qrData = ticket.qr_code || ticket.qr_data || ticket.public_token || ticket.id;
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

  const BASE_URL = Deno.env.get('BASE_URL') || 'https://stagenation.be';
  const brandLogoUrl = `${BASE_URL}/stagenation-logo.webp`;

  const footerName = brand?.display_name || brand?.name || 'StageNation';
  const footerEmail = brand?.support_email || brand?.email || 'tickets@stagenation.be';

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
        ${escapeHtml(ticket.ticket_types?.name || 'Ticket')}
      </h3>
      <div style="text-align: center; margin: 20px 0;">
        <img src="${qrDataUrl}" width="220" height="220" alt="QR Code ${escapeHtml(ticket.ticket_number)}" style="display: block; margin: 0 auto; width: 220px; height: 220px; border: 1px solid #cbd5e1; border-radius: 8px;" />
      </div>
      <div style="background-color: #f1f5f9; border-radius: 8px; padding: 16px; margin: 16px 0; text-align: center;">
        <p style="color: #64748b; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">
          Ticket Nummer
        </p>
        <p style="color: #0f172a; font-size: 18px; font-weight: 700; margin: 0; font-family: 'Courier New', monospace; letter-spacing: 1px;">
          ${escapeHtml(ticket.ticket_number)}
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
  <title>Je tickets voor ${escapeHtml(event.name)}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background: ${emailHeaderBg}; padding: 40px 24px; text-align: center;">
      ${event.logo_url ? `<div style="margin-bottom: 20px;">
        <img src="${logoUrl}" alt="${escapeHtml(event.name)}" style="max-width: 200px; height: auto; display: inline-block;" />
      </div>` : ''}
      <h1 style="color: ${emailHeaderText}; margin: 0; font-size: 28px; font-weight: 700;">
        Je tickets voor ${escapeHtml(event.name)}
      </h1>
      <p style="color: ${emailHeaderText}; opacity: 0.85; margin: 12px 0 0 0; font-size: 16px;">
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
          <strong style="color: #0f172a;">Locatie:</strong> ${escapeHtml(event.location || '')}<br />
          ${event.location_address ? `<span style="color: #64748b; font-size: 14px;">${escapeHtml(event.location_address)}</span><br />` : ''}
          <strong style="color: #0f172a;">Datum:</strong> ${formatDate(event.start_date)}<br />
          <strong style="color: #0f172a;">Tijd:</strong> ${formatTime(event.start_date)}
        </p>
      </div>

      <!-- Order Summary -->
      <div style="margin-bottom: 32px;">
        <h2 style="color: #0f172a; margin-bottom: 16px; font-size: 20px;">
          Ordernummer: ${escapeHtml(order.order_number)}
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
        <strong style="color: #0f172a;">${escapeHtml(footerName)}</strong>
      </p>
      ${footerEmail ? `<p style="color: #94a3b8; margin: 16px 0 0 0; font-size: 12px;">
        Voor vragen, neem contact met ons op via <a href="mailto:${escapeHtml(footerEmail)}" style="color: #0e7490; text-decoration: none;">${escapeHtml(footerEmail)}</a>
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

    let seatTickets: any[] = [];
    if (order.product_type === 'seat' || order.product_type === 'seats') {
      const { data: seatData, error: seatError } = await adminClient
        .from('ticket_seats')
        .select('*, seats(id, row_label, seat_number, seat_type, section_id, seat_sections(id, name, color, price_category, price_amount))')
        .eq('order_id', orderId);

      if (seatError) {
        console.error('SEAT_TICKETS: Error -', seatError.message);
      } else {
        seatTickets = seatData || [];
      }
    }

    const hasTickets = tickets && tickets.length > 0;
    const hasTableBookings = tableBookings && tableBookings.length > 0;
    const hasSeatTickets = seatTickets.length > 0;

    if (!hasTickets && !hasTableBookings && !hasSeatTickets) {
      console.error('ITEMS: No tickets, table bookings, or seat tickets found for order:', orderId);
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'No tickets or table bookings found for this order',
          code: 'NO_ITEMS',
          details: `Order ${order.order_number} has no valid/used tickets, active table bookings, or seat tickets`
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

    if (hasSeatTickets) {
      html = await buildSeatOrderEmail(order, event, seatTickets, brand);
      emailSubject = `Je tickets voor ${event.name}`;
    } else if (hasTableBookings) {
      html = await buildTableReservationEmail(order, event, tableBookings, brand);
      emailSubject = `Je tafelreservatie voor ${event.name}`;
    } else {
      html = await buildTicketEmail(order, event, tickets, brand);
      emailSubject = `Je tickets voor ${event.name}`;
    }

    let pdfAttachments: { filename: string; content: string }[] = [];
    if (hasSeatTickets && seatTickets.length > 0) {
      try {
        console.log('[pdf] Generating seat ticket PDF for', seatTickets.length, 'seats, order:', order.order_number);
        const pdfBase64 = await buildSeatTicketPdf(order, event, seatTickets);
        const pdfSizeBytes = Math.ceil(pdfBase64.length * 3 / 4);
        console.log('[pdf] Seat ticket PDF generated, base64 length:', pdfBase64.length, 'estimated bytes:', pdfSizeBytes);
        if (pdfSizeBytes < 1000) {
          console.error('[pdf] WARNING: PDF is suspiciously small (' + pdfSizeBytes + ' bytes), may be empty');
        }
        const filename = `StageNation-Tickets-${order.order_number || 'tickets'}.pdf`;
        pdfAttachments = [{ filename, content: pdfBase64 }];
      } catch (pdfErr: any) {
        console.error('PDF: Seat ticket generation failed, sending without attachment:', pdfErr.message, pdfErr.stack);
      }
    } else if (hasTickets && tickets.length > 0) {
      try {
        console.log('[pdf] Generating ticket PDF for', tickets.length, 'tickets, order:', order.order_number);
        const pdfBase64 = await buildTicketPdf(order, event, tickets);
        const pdfSizeBytes = Math.ceil(pdfBase64.length * 3 / 4);
        console.log('[pdf] Ticket PDF generated, base64 length:', pdfBase64.length, 'estimated bytes:', pdfSizeBytes);
        if (pdfSizeBytes < 1000) {
          console.error('[pdf] WARNING: PDF is suspiciously small (' + pdfSizeBytes + ' bytes), may be empty');
        }
        const filename = `StageNation-Tickets-${order.order_number || 'tickets'}.pdf`;
        pdfAttachments = [{ filename, content: pdfBase64 }];
      } catch (pdfErr: any) {
        console.error('PDF: Generation failed, sending without attachment:', pdfErr.message, pdfErr.stack);
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
        event_id: event.id,
        status: 'sent',
        template: 'send_ticket_email',
        recipient_email: recipientEmailResolved,
        subject: emailSubject,
        provider_message_id: emailResult.id,
      });

    return new Response(
      JSON.stringify({
        ok: true,
        message: hasSeatTickets ? 'Seat tickets sent successfully' : hasTableBookings ? 'Table reservation confirmation sent successfully' : 'Tickets sent successfully',
        order_id: orderId,
        recipient: recipientEmailResolved,
        ticket_count: hasTickets ? tickets.length : 0,
        seat_count: hasSeatTickets ? seatTickets.length : 0,
        table_count: hasTableBookings ? tableBookings.length : 0,
        type: hasSeatTickets ? 'seat_tickets' : hasTableBookings ? 'table_reservation' : 'tickets',
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
              template: 'send_ticket_email',
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
