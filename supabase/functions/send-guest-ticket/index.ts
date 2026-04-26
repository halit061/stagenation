import { createClient } from 'npm:@supabase/supabase-js@2';
import { Resend } from 'npm:resend@4.0.0';
import { randomBytes } from 'node:crypto';
import { PDFDocument, rgb, StandardFonts } from 'npm:pdf-lib@1.17.1';
import QRCode from 'npm:qrcode@1.5.4';
import { getCorsHeaders } from "../_shared/cors.ts";

interface SeatAssignment {
  seat_id: string;
  section_name: string;
  row_label: string;
  seat_number: number;
}

interface SendGuestTicketRequest {
  event_id: string;
  ticket_type_id: string;
  recipient_email: string;
  recipient_name: string;
  notes?: string;
  assigned_table_id?: string;
  table_note?: string;
  persons_count?: number;
  assign_seats?: boolean;
  seat_assignments?: SeatAssignment[];
}

interface TableInfo {
  id: string;
  table_number: string;
  table_type: string;
  capacity: number;
}

interface QrEntry {
  id: string;
  person_index: number;
  qr_token: string;
  qr_data_url: string;
  seat?: SeatAssignment;
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

function generateSecureToken(): string {
  return randomBytes(32).toString('hex');
}

async function generateQRCode(data: string): Promise<string> {
  try {
    return await QRCode.toDataURL(data, { width: 300, margin: 2 });
  } catch {
    return '';
  }
}

function drawQROnPage(page: any, qrData: string, x: number, y: number, size: number) {
  const qrCode = QRCode.create(qrData, { errorCorrectionLevel: 'M' });
  const modules = qrCode.modules;
  const moduleCount = modules.size;
  const margin = 2;
  const totalModules = moduleCount + margin * 2;
  const cellSize = size / totalModules;

  page.drawRectangle({
    x, y, width: size, height: size, color: rgb(1, 1, 1),
  });

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

type MiniFloorplanSeat = { id: string; x: number; y: number; ttId: string };

function hexToRgbTuple(hex: string): [number, number, number] {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return [0.6, 0.6, 0.6];
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
}

function drawMiniFloorplanOnPage(
  page: any,
  bx: number, by: number, bw: number, bh: number,
  allSeats: MiniFloorplanSeat[],
  ttColors: Map<string, string>,
  highlightedSeatIds: Set<string>,
  font: any,
  boldFont: any,
) {
  if (!allSeats || allSeats.length === 0) return;
  page.drawRectangle({
    x: bx, y: by, width: bw, height: bh,
    color: rgb(0.985, 0.99, 0.995),
    borderColor: rgb(0.8, 0.82, 0.85),
    borderWidth: 0.6,
  });
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of allSeats) {
    if (s.x < minX) minX = s.x;
    if (s.x > maxX) maxX = s.x;
    if (s.y < minY) minY = s.y;
    if (s.y > maxY) maxY = s.y;
  }
  if (!isFinite(minX)) return;
  const titleH = 14;
  const innerPad = 6;
  const drawW = bw - innerPad * 2;
  const drawH = bh - innerPad * 2 - titleH;
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = Math.min(drawW / spanX, drawH / spanY);
  const offX = bx + innerPad + (drawW - spanX * scale) / 2;
  const offY = by + innerPad + (drawH - spanY * scale) / 2;
  page.drawText('Plattegrond - jouw zitplaats', {
    x: bx + innerPad, y: by + bh - 11, size: 8, font: boldFont, color: rgb(0.2, 0.2, 0.25),
  });
  const highlights: { x: number; y: number }[] = [];
  for (const s of allSeats) {
    const px = offX + (s.x - minX) * scale;
    const py = offY + (maxY - s.y) * scale;
    if (highlightedSeatIds.has(s.id)) {
      highlights.push({ x: px, y: py });
      continue;
    }
    const [r, g, b] = hexToRgbTuple(ttColors.get(s.ttId) || '#9ca3af');
    page.drawCircle({ x: px, y: py, size: 0.85, color: rgb(r, g, b), opacity: 0.55 });
  }
  for (const h of highlights) {
    page.drawCircle({ x: h.x, y: h.y, size: 7, color: rgb(0.92, 0.18, 0.18), opacity: 0.22 });
    page.drawCircle({ x: h.x, y: h.y, size: 3.4, color: rgb(0.92, 0.18, 0.18) });
    page.drawCircle({ x: h.x, y: h.y, size: 1.3, color: rgb(1, 1, 1) });
  }
}

async function generateTicketsPDF(
  event: any,
  recipientName: string,
  qrEntries: QrEntry[],
  orderNumber: string,
  tableInfo: TableInfo | null,
  tableNote: string | null,
  guestNotes: string | null,
  allEventSeats: MiniFloorplanSeat[] = [],
  ttColors: Map<string, string> = new Map(),
): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (let i = 0; i < qrEntries.length; i++) {
    const qr = qrEntries[i];
    const page = pdfDoc.addPage([595, 842]);
    const { width, height } = page.getSize();

    let yPos = height - 60;

    page.drawText(event.name || 'Event', {
      x: 50, y: yPos, size: 24, font: boldFont, color: rgb(0.86, 0.15, 0.15),
    });
    yPos -= 40;

    if (event.brand_name) {
      page.drawText(String(event.brand_name), {
        x: 50, y: yPos, size: 12, font: boldFont, color: rgb(0.4, 0.4, 0.4),
      });
      yPos -= 25;
    }

    page.drawText('Guest Ticket', {
      x: 50, y: yPos, size: 20, font: boldFont, color: rgb(0.2, 0.2, 0.2),
    });
    yPos -= 30;

    if (qrEntries.length > 1) {
      page.drawText(`Ticket ${qr.person_index} van ${qrEntries.length}`, {
        x: 50, y: yPos, size: 14, font, color: rgb(0.4, 0.4, 0.4),
      });
      yPos -= 35;
    }

    page.drawText(`Voor: ${recipientName}`, {
      x: 50, y: yPos, size: 12, font, color: rgb(0.3, 0.3, 0.3),
    });
    yPos -= 20;

    const eventDate = formatDate(event.start_date);
    const eventTime = formatTime(event.start_date);
    page.drawText(`Datum: ${eventDate}`, {
      x: 50, y: yPos, size: 12, font, color: rgb(0.3, 0.3, 0.3),
    });
    yPos -= 20;

    page.drawText(`Tijd: ${eventTime}`, {
      x: 50, y: yPos, size: 12, font, color: rgb(0.3, 0.3, 0.3),
    });
    yPos -= 20;

    if (event.venue_name) {
      page.drawText(`Venue: ${String(event.venue_name)}`, {
        x: 50, y: yPos, size: 12, font: boldFont, color: rgb(0.3, 0.3, 0.3),
      });
      yPos -= 20;
    }

    if (event.location) {
      page.drawText(`Locatie: ${String(event.location)}`, {
        x: 50, y: yPos, size: 12, font, color: rgb(0.3, 0.3, 0.3),
      });
      yPos -= 20;
    }

    if (event.location_address) {
      page.drawText(`Adres: ${String(event.location_address)}`, {
        x: 50, y: yPos, size: 12, font, color: rgb(0.3, 0.3, 0.3),
      });
      yPos -= 30;
    } else {
      yPos -= 10;
    }

    const qrSize = 220;
    const qrX = 50;
    const qrY = yPos - qrSize - 20;
    try {
      drawQROnPage(page, qr.qr_token, qrX, qrY, qrSize);
      if (allEventSeats.length > 0 && qr.seat?.seat_id) {
        const fpX = qrX + qrSize + 20;
        const fpW = width - 50 - fpX;
        drawMiniFloorplanOnPage(
          page, fpX, qrY, fpW, qrSize,
          allEventSeats, ttColors, new Set([qr.seat.seat_id]),
          font, boldFont,
        );
      }
      yPos = qrY - 20;
    } catch (e) {
      console.error('Failed to draw QR code:', e);
      page.drawText('QR code kon niet worden gegenereerd', {
        x: 50, y: yPos - 30, size: 10, font, color: rgb(0.8, 0.2, 0.2),
      });
      yPos -= 60;
    }

    if (qr.seat) {
      page.drawRectangle({
        x: 40, y: yPos - 55, width: width - 80, height: 50,
        color: rgb(0.95, 0.97, 1.0), borderColor: rgb(0.2, 0.45, 0.8), borderWidth: 1,
      });
      page.drawText(`Sectie: ${qr.seat.section_name}   |   Rij: ${qr.seat.row_label}   |   Stoel: ${qr.seat.seat_number}`, {
        x: 55, y: yPos - 25, size: 14, font: boldFont, color: rgb(0.1, 0.2, 0.5),
      });
      page.drawText('Gereserveerde zitplaats', {
        x: 55, y: yPos - 43, size: 9, font, color: rgb(0.4, 0.5, 0.7),
      });
      yPos -= 65;
    } else {
      page.drawText('Vrije toegang', {
        x: 50, y: yPos, size: 12, font: boldFont, color: rgb(0.3, 0.3, 0.3),
      });
      yPos -= 25;
    }

    page.drawText(`Ticket nummer: ${orderNumber}-${qr.person_index}`, {
      x: 50, y: yPos, size: 10, font, color: rgb(0.5, 0.5, 0.5),
    });
    yPos -= 25;

    if (tableInfo) {
      const tType = tableInfo.table_type === 'seating' ? 'Zittafel' : 'Sta-tafel';
      page.drawText(`Tafel: ${tableInfo.table_number} (${tType}, ${tableInfo.capacity} pers.)`, {
        x: 50, y: yPos, size: 11, font: boldFont, color: rgb(0.03, 0.57, 0.7),
      });
      yPos -= 20;
      if (tableNote) {
        page.drawText(String(tableNote).substring(0, 80), {
          x: 50, y: yPos, size: 10, font, color: rgb(0.03, 0.57, 0.7),
        });
        yPos -= 25;
      }
    }

    if (guestNotes) {
      page.drawText('Notitie:', {
        x: 50, y: yPos, size: 11, font: boldFont, color: rgb(0.6, 0.3, 0.05),
      });
      yPos -= 18;
      page.drawText(String(guestNotes).substring(0, 80), {
        x: 50, y: yPos, size: 10, font, color: rgb(0.6, 0.3, 0.05),
      });
      yPos -= 25;
    }

    page.drawText('Toon deze QR code bij de ingang van het evenement.', {
      x: 50, y: yPos, size: 10, font: boldFont, color: rgb(0.2, 0.2, 0.2),
    });
    yPos -= 15;
    page.drawText('Dit ticket is geldig voor 1 persoon.', {
      x: 50, y: yPos, size: 10, font, color: rgb(0.4, 0.4, 0.4),
    });

    page.drawText('Powered by Lumetrix', {
      x: width - 150, y: 30, size: 8, font, color: rgb(0.6, 0.6, 0.6),
    });
  }

  const pdfBytes = await pdfDoc.save();
  let binary = '';
  for (let i = 0; i < pdfBytes.length; i++) binary += String.fromCharCode(pdfBytes[i]);
  return btoa(binary);
}

async function sendEmail({ to, subject, html, attachments }: { to: string; subject: string; html: string; attachments?: Array<{ filename: string; content: string }> }): Promise<{ id: string }> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const emailFrom = Deno.env.get('EMAIL_FROM') || 'StageNation Tickets <tickets@lumetrix.be>';

  if (!resendApiKey) {
    throw new Error('Email service not configured - RESEND_API_KEY missing');
  }

  const resend = new Resend(resendApiKey);

  const emailPayload: any = {
    from: emailFrom,
    to: [to],
    reply_to: 'tickets@stagenation.be',
    subject,
    html,
  };

  if (attachments && attachments.length > 0) {
    emailPayload.attachments = attachments.map(att => ({
      filename: att.filename,
      content: att.content,
    }));
  }

  const result = await resend.emails.send(emailPayload);

  if (result?.error) {
    throw new Error(`Resend API error: ${result.error.message || JSON.stringify(result.error)}`);
  }

  const emailId = result?.data?.id || result?.id;
  if (!emailId) {
    throw new Error('Resend API returned no email ID');
  }

  return { id: emailId };
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

function buildMultiPersonEmail(event: any, recipientName: string, ticketCount: number, tableInfo: TableInfo | null, tableNote: string | null, guestNotes: string | null, publicToken: string, seatAssignments?: SeatAssignment[]): string {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const logoUrl = event.logo_url
    ? `${supabaseUrl}/storage/v1/object/public/${event.logo_url}`
    : null;

  const BASE_URL = Deno.env.get('BASE_URL') || 'https://stagenation.be';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Je Guest Tickets voor ${event.name}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 40px 24px; text-align: center;">
      ${logoUrl ? `<div style="margin-bottom: 20px;">
        <img src="${logoUrl}" alt="${event.name}" style="max-width: 200px; height: auto; display: inline-block;" />
      </div>` : ''}
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">
        Guest Tickets (${ticketCount} personen)
      </h1>
      <p style="color: rgba(255,255,255,0.95); margin: 12px 0 0 0; font-size: 18px;">
        ${event.name}
      </p>
      ${event.brand_name ? `<p style="color: rgba(255,255,255,0.85); margin: 8px 0 0 0; font-size: 14px;">${event.brand_name}</p>` : ''}
    </div>

    <div style="padding: 40px 24px;">
      <p style="color: #0f172a; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
        Beste ${escapeHtml(recipientName)},
      </p>

      <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 32px 0;">
        Je hebt <strong>${ticketCount} guest tickets</strong> ontvangen voor <strong>${event.name}</strong>.
        Elk ticket is geldig voor <strong>1 persoon</strong>.
      </p>

      <div style="background-color: #f8fafc; border-left: 4px solid #dc2626; padding: 20px; margin-bottom: 32px; border-radius: 8px;">
        <h2 style="color: #0f172a; margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">
          Evenement Details
        </h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.8; margin: 0;">
          ${event.venue_name ? `<strong style="color: #0f172a;">Venue:</strong> ${event.venue_name}<br />` : ''}
          <strong style="color: #0f172a;">Datum:</strong> ${formatDate(event.start_date)}<br />
          <strong style="color: #0f172a;">Tijd:</strong> ${formatTime(event.start_date)}<br />
          ${event.location ? `<strong style="color: #0f172a;">Locatie:</strong> ${event.location}<br />` : ''}
          ${event.location_address ? `<strong style="color: #0f172a;">Adres:</strong> ${event.location_address}<br />` : ''}
        </p>
      </div>

      ${seatAssignments && seatAssignments.length > 0 ? `
      <div style="background-color: #eff6ff; border: 2px solid #3b82f6; border-radius: 12px; padding: 20px; margin-bottom: 32px;">
        <h3 style="color: #1e40af; margin: 0 0 12px 0; font-size: 16px; font-weight: 600;">Toegewezen zitplaatsen</h3>
        ${seatAssignments.map((s, idx) => `
        <div style="background-color: #ffffff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 10px 14px; margin-bottom: ${idx < seatAssignments.length - 1 ? '8' : '0'}px;">
          <span style="color: #1e40af; font-weight: 600; font-size: 14px;">Ticket ${idx + 1}:</span>
          <span style="color: #1e3a5f; font-size: 14px;"> ${escapeHtml(s.section_name)} &mdash; Rij ${escapeHtml(s.row_label)} &mdash; Stoel ${s.seat_number}</span>
        </div>`).join('')}
      </div>
      ` : ''}

      <div style="background-color: #dcfce7; border: 2px solid #16a34a; border-radius: 12px; padding: 24px; margin-bottom: 32px; text-align: center;">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 16px auto; display: block;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        <h3 style="color: #15803d; margin: 0 0 8px 0; font-size: 18px; font-weight: 600;">
          Je Tickets staan in de PDF
        </h3>
        <p style="color: #166534; font-size: 14px; margin: 0;">
          Open de bijgevoegde PDF om al je ${ticketCount} QR codes te bekijken.<br/>
          Je kan de PDF printen of op je telefoon bewaren.
        </p>
      </div>

      ${tableInfo ? `
      <div style="background-color: #ecfeff; border: 1px solid #0891b2; border-radius: 8px; padding: 16px; margin-bottom: 32px;">
        <p style="color: #0891b2; font-size: 14px; margin: 0;">
          <strong style="color: #0f172a;">Tafel:</strong> ${tableInfo.table_number} (${tableInfo.table_type === 'seating' ? 'Zittafel' : 'Sta-tafel'}, ${tableInfo.capacity} pers.)
        </p>
        ${tableNote ? `<p style="color: #0891b2; font-size: 13px; margin: 8px 0 0 0;"><strong style="color: #0f172a;">Notitie:</strong> ${escapeHtml(tableNote)}</p>` : ''}
      </div>
      ` : ''}

      ${guestNotes ? `
      <div style="background-color: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 16px; margin-bottom: 32px;">
        <p style="color: #92400e; font-size: 14px; line-height: 1.6; margin: 0;">
          <strong>Notitie:</strong> ${escapeHtml(guestNotes)}
        </p>
      </div>
      ` : ''}

      <div style="text-align: center; margin: 12px 0 32px 0; padding: 12px; background-color: #f8fafc; border-radius: 6px;">
        <p style="color: #64748b; font-size: 12px; margin: 0 0 8px 0;">
          Je kan je tickets ook online bekijken:
        </p>
        <a href="${BASE_URL}/ticket-view?token=${publicToken}" style="display: inline-block; background-color: #dc2626; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 6px; font-size: 14px; font-weight: 600;">
          Open tickets online
        </a>
      </div>

      <div style="background-color: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin-bottom: 32px;">
        <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0;">
          <strong style="color: #0f172a;">Belangrijk:</strong> Toon de QR codes bij de ingang van het evenement.
          Elk ticket is geldig voor 1 persoon - elke QR kan maar 1x gescand worden.
        </p>
      </div>

      <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
        Heb je vragen? Neem contact met ons op via <a href="mailto:tickets@stagenation.be" style="color: #dc2626; text-decoration: none;">tickets@stagenation.be</a>
      </p>

      <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0;">
        Tot binnenkort!<br />
        <strong style="color: #0f172a;">Team ${event.brand_name || 'StageNation'}</strong>
      </p>
    </div>

    <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="color: #64748b; font-size: 13px; margin: 0 0 8px 0;">
        ${new Date().getFullYear()} ${event.brand_name || 'StageNation'}. Alle rechten voorbehouden.
      </p>
      <p style="color: #94a3b8; font-size: 12px; margin: 0;">
        Powered by Lumetrix
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  let orderId: string | null = null;
  let assignedSeatIds: string[] = [];

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

    const { data: { user }, error: authError } = await authClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // SECURITY: Only check active roles
    const { data: userRoles } = await adminClient
      .from('user_roles')
      .select('role, event_id')
      .eq('user_id', user.id)
      .eq('is_active', true);

    const isSuperAdmin = userRoles?.some(r => r.role === 'superadmin' || r.role === 'super_admin');
    const isAdmin = userRoles?.some(r => r.role === 'admin' || r.role === 'organizer');

    if (!isSuperAdmin && !isAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: SendGuestTicketRequest = await req.json();
    const {
      event_id,
      ticket_type_id,
      recipient_email,
      recipient_name,
      notes,
      assigned_table_id,
      table_note,
      persons_count = 1,
      assign_seats = false,
      seat_assignments = [],
    } = body;

    if (!event_id || !ticket_type_id || !recipient_email || !recipient_name) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SECURITY: Enforce upper bound to prevent resource exhaustion (max 50 tickets per guest invite)
    const MAX_PERSONS_PER_GUEST_TICKET = 50;
    const validatedPersonsCount = Math.min(Math.max(1, persons_count), MAX_PERSONS_PER_GUEST_TICKET);

    if (persons_count > MAX_PERSONS_PER_GUEST_TICKET) {
      return new Response(
        JSON.stringify({ success: false, error: `Maximum ${MAX_PERSONS_PER_GUEST_TICKET} persons per guest ticket` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isSuperAdmin) {
      const hasEventAccess = userRoles?.some(r =>
        (r.role === 'admin' || r.role === 'organizer') &&
        (r.event_id === event_id || r.event_id === null)
      );

      if (!hasEventAccess) {
        return new Response(
          JSON.stringify({ success: false, error: 'No access to this event' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const { data: event, error: eventError } = await adminClient
      .from('events')
      .select('*')
      .eq('id', event_id)
      .single();

    if (eventError || !event) {
      return new Response(
        JSON.stringify({ success: false, error: 'Event not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    event.brand_name = null;
    if (event.brand_slug) {
      const { data: brandData } = await adminClient
        .from('brands')
        .select('name')
        .eq('slug', event.brand_slug)
        .maybeSingle();
      event.brand_name = brandData?.name || null;
    }

    const { data: ticketType, error: typeError } = await adminClient
      .from('ticket_types')
      .select('*')
      .eq('id', ticket_type_id)
      .eq('event_id', event_id)
      .single();

    if (typeError || !ticketType) {
      return new Response(
        JSON.stringify({ success: false, error: 'Ticket type not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const guestRandom = Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(36).padStart(2, '0')).join('').toUpperCase().substring(0, 12);
    const orderNumber = `GST-${guestRandom}`;

    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .insert({
        event_id,
        order_number: orderNumber,
        payer_email: recipient_email,
        payer_name: recipient_name,
        payer_phone: '',
        total_amount: 0,
        status: 'comped',
        payment_provider: 'guest',
        created_by_admin_id: user.id,
        product_type: 'REGULAR',
        paid_at: new Date().toISOString(),
        persons_count: validatedPersonsCount,
        send_mode: 'single_email',
        metadata: {
          type: 'guest_ticket',
          notes: notes || null,
          sent_by: user.email,
          sent_by_id: user.id,
          persons_count: validatedPersonsCount,
          send_mode: 'single_email'
        }
      })
      .select()
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create order', details: orderError?.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    orderId = order.id;

    let tableInfo: TableInfo | null = null;
    if (assigned_table_id) {
      const { data: tableData } = await adminClient
        .from('floorplan_tables')
        .select('id, table_number, table_type, capacity')
        .eq('id', assigned_table_id)
        .maybeSingle();

      if (tableData) {
        tableInfo = tableData;
      }
    }

    if (assign_seats && seat_assignments.length > 0) {
      if (seat_assignments.length !== validatedPersonsCount) {
        return new Response(
          JSON.stringify({ success: false, error: `Aantal stoelen (${seat_assignments.length}) komt niet overeen met aantal tickets (${validatedPersonsCount})` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const seatIds = seat_assignments.map(s => s.seat_id);
      const { data: lockResult, error: lockError } = await adminClient.rpc('assign_guest_seats_atomic', {
        p_seat_ids: seatIds,
        p_event_id: event_id,
      });

      if (lockError) {
        console.error('Atomic seat assignment failed:', lockError);
        return new Response(
          JSON.stringify({ success: false, error: 'Stoelen konden niet worden toegewezen. Probeer opnieuw.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!lockResult?.success) {
        const unavailableCount = lockResult?.unavailable_count || 0;
        return new Response(
          JSON.stringify({ success: false, error: `${unavailableCount} stoel(en) zijn niet meer beschikbaar. Vernieuw de pagina.` }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    assignedSeatIds = assign_seats ? seat_assignments.map(s => s.seat_id) : [];
    const qrEntries: QrEntry[] = [];

    for (let i = 1; i <= validatedPersonsCount; i++) {
      const qrToken = generateSecureToken();
      const seatInfo = assign_seats && seat_assignments[i - 1] ? seat_assignments[i - 1] : null;

      const insertPayload: Record<string, unknown> = {
        event_id,
        order_id: order.id,
        person_index: i,
        name: null,
        qr_token: qrToken,
      };
      if (seatInfo) {
        insertPayload.seat_id = seatInfo.seat_id;
        insertPayload.section_name = seatInfo.section_name;
        insertPayload.row_label = seatInfo.row_label;
        insertPayload.seat_number = seatInfo.seat_number;
      }

      const { data: qrEntry, error: qrError } = await adminClient
        .from('guest_ticket_qrs')
        .insert(insertPayload)
        .select()
        .single();

      if (qrError || !qrEntry) {
        console.error(`Failed to create QR entry ${i}:`, qrError);
        continue;
      }

      let qrDataUrl = '';
      try {
        qrDataUrl = await generateQRCode(qrToken);
      } catch (_e) {}

      qrEntries.push({
        id: qrEntry.id,
        person_index: i,
        qr_token: qrToken,
        qr_data_url: qrDataUrl,
        seat: seatInfo || undefined,
      });
    }

    const ttPrefix = (ticketType.name || 'TKT').replace(/[^A-Za-z]/g, '').toUpperCase().substring(0, 3).padEnd(3, 'X');
    const tktRandom = Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(36).padStart(2, '0')).join('').toUpperCase().substring(0, 12);
    const ticketNumber = `${ttPrefix}-${tktRandom}`;
    const mainToken = qrEntries.length > 0 ? qrEntries[0].qr_token : generateSecureToken();

    const { data: ticket, error: ticketError } = await adminClient
      .from('tickets')
      .insert({
        order_id: order.id,
        event_id,
        ticket_type_id,
        ticket_number: ticketNumber,
        token: mainToken.substring(0, 32),
        status: 'valid',
        holder_email: recipient_email,
        holder_name: recipient_name,
        qr_data: mainToken,
        product_type: 'REGULAR',
        assigned_table_id: assigned_table_id || null,
        table_note: table_note || null,
        metadata: {
          type: 'guest_ticket',
          notes: notes || null,
          sent_by: user.email,
          persons_count: validatedPersonsCount,
        }
      })
      .select()
      .single();

    if (ticketError) {
      console.error('Failed to create ticket record:', ticketError);
    }

    if (ticket?.id && assign_seats && seat_assignments.length > 0) {
      const ticketSeatRows = qrEntries
        .filter(qr => qr.seat)
        .map(qr => ({
          ticket_id: ticket.id,
          seat_id: qr.seat!.seat_id,
          event_id,
          price_paid: 0,
          order_id: order.id,
        }));

      if (ticketSeatRows.length > 0) {
        const { error: tsSeatErr } = await adminClient
          .from('ticket_seats')
          .insert(ticketSeatRows);

        if (tsSeatErr) {
          console.error('Failed to create ticket_seats records:', tsSeatErr);
        }
      }
    }

    await adminClient
      .from('guest_ticket_audit_log')
      .insert({
        order_id: order.id,
        ticket_id: ticket?.id,
        event_id,
        action: 'sent',
        sent_by_user_id: user.id,
        sent_by_email: user.email || '',
        recipient_email,
        recipient_name,
        metadata: {
          notes,
          ticket_number: ticketNumber,
          order_number: orderNumber,
          persons_count: validatedPersonsCount,
        },
      });

    const publicToken = ticket?.public_token || '';

    let pdfAttachments: Array<{ filename: string; content: string }> = [];
    try {
      let mapSeats: MiniFloorplanSeat[] = [];
      const ttColors = new Map<string, string>();
      try {
        const { data: ttRows } = await adminClient
          .from('ticket_types')
          .select('id, color')
          .eq('event_id', event_id);
        if (ttRows) {
          for (const t of ttRows) ttColors.set(t.id, t.color || '#9ca3af');
        }
        const eventTtIds = ttRows ? ttRows.map((t: any) => t.id) : [];
        if (eventTtIds.length > 0) {
          let from = 0;
          const PAGE = 1000;
          while (true) {
            const { data: chunk } = await adminClient
              .from('seats')
              .select('id, x_position, y_position, ticket_type_id')
              .in('ticket_type_id', eventTtIds)
              .eq('is_active', true)
              .range(from, from + PAGE - 1);
            if (!chunk || chunk.length === 0) break;
            for (const s of chunk) {
              mapSeats.push({ id: s.id, x: Number(s.x_position), y: Number(s.y_position), ttId: s.ticket_type_id });
            }
            if (chunk.length < PAGE) break;
            from += PAGE;
          }
        }
      } catch (mapErr: any) {
        console.error('[pdf] mini floorplan load failed:', mapErr?.message);
        mapSeats = [];
      }

      const pdfBase64 = await generateTicketsPDF(
        event,
        recipient_name,
        qrEntries,
        orderNumber,
        tableInfo,
        table_note || null,
        notes || null,
        mapSeats,
        ttColors,
      );
      pdfAttachments = [{
        filename: `tickets-${orderNumber}.pdf`,
        content: pdfBase64
      }];
    } catch (pdfError) {
      console.error('[pdf] PDF generatie mislukt, mail wordt zonder PDF verstuurd:', pdfError.message);
    }

    const emailHtml = buildMultiPersonEmail(
      event,
      recipient_name,
      validatedPersonsCount,
      tableInfo,
      table_note || null,
      notes || null,
      publicToken,
      assign_seats ? seat_assignments : undefined
    );

    await sendEmail({
      to: recipient_email,
      subject: `Guest Tickets (${validatedPersonsCount}x): ${event.name}`,
      html: emailHtml,
      attachments: pdfAttachments.length > 0 ? pdfAttachments : undefined
    });

    await adminClient
      .from('orders')
      .update({
        email_sent: true,
        email_sent_at: new Date().toISOString(),
        email_error: null,
      })
      .eq('id', order.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: `${validatedPersonsCount} guest ticket(s) sent successfully`,
        order_id: order.id,
        order_number: orderNumber,
        ticket_id: ticket?.id,
        persons_count: validatedPersonsCount,
        emails_sent: 1,
        qr_count: qrEntries.length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Guest ticket error:', error);

    if (orderId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const rollbackClient = createClient(supabaseUrl, supabaseServiceKey);

        const seatIdsToRestore: string[] = [];

        const { data: qrsToRollback } = await rollbackClient
          .from('guest_ticket_qrs')
          .select('seat_id')
          .eq('order_id', orderId)
          .not('seat_id', 'is', null);

        if (qrsToRollback) {
          seatIdsToRestore.push(...qrsToRollback.map(q => q.seat_id).filter(Boolean));
        }

        if (assignedSeatIds && assignedSeatIds.length > 0) {
          for (const sid of assignedSeatIds) {
            if (!seatIdsToRestore.includes(sid)) seatIdsToRestore.push(sid);
          }
        }

        if (seatIdsToRestore.length > 0) {
          await rollbackClient
            .from('seats')
            .update({ status: 'available' })
            .in('id', seatIdsToRestore);
        }

        await rollbackClient.from('ticket_seats').delete().eq('order_id', orderId);
        await rollbackClient.from('guest_ticket_qrs').delete().eq('order_id', orderId);
        await rollbackClient.from('tickets').delete().eq('order_id', orderId);
        await rollbackClient.from('guest_ticket_audit_log').delete().eq('order_id', orderId);
        await rollbackClient.from('email_logs').delete().eq('order_id', orderId);
        await rollbackClient.from('orders').delete().eq('id', orderId);
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
