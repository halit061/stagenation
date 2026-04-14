import { createClient } from 'npm:@supabase/supabase-js@2';
import { Resend } from 'npm:resend@4.0.0';
import { PDFDocument, rgb, StandardFonts } from 'npm:pdf-lib@1.17.1';
import QRCode from 'npm:qrcode@1.5.4';
import { getCorsHeaders } from "../_shared/cors.ts";

interface SeatAssignment {
  seat_id: string;
  section_name: string;
  row_label: string;
  seat_number: number;
}

interface QrEntry {
  id: string;
  person_index: number;
  qr_token: string;
  qr_data_url: string;
  seat?: SeatAssignment;
}

interface TableInfo {
  id: string;
  table_number: string;
  table_type: string;
  capacity: number;
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

async function generateTicketsPDF(
  event: any,
  recipientName: string,
  qrEntries: QrEntry[],
  orderNumber: string,
  tableInfo: TableInfo | null,
  tableNote: string | null,
  guestNotes: string | null
): Promise<Uint8Array> {
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

    const qrSize = 280;
    const qrX = (width - qrSize) / 2;
    const qrY = yPos - qrSize - 20;
    try {
      drawQROnPage(page, qr.qr_token, qrX, qrY, qrSize);
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
  return pdfBytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function sendEmail({ to, subject, html, attachments }: { to: string; subject: string; html: string; attachments?: Array<{ filename: string; content: Uint8Array }> }): Promise<{ id: string }> {
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
      content: uint8ArrayToBase64(att.content),
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

function escapeHtml(str: string): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
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
        Beste ${recipientName},
      </p>

      <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 32px 0;">
        Hier zijn je <strong>${ticketCount} guest tickets</strong> voor <strong>${event.name}</strong>.
        Elk ticket is geldig voor <strong>1 persoon</strong>.
      </p>

      <div style="background-color: #f8fafc; border-left: 4px solid #dc2626; padding: 20px; margin-bottom: 32px; border-radius: 8px;">
        <h2 style="color: #0f172a; margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">
          Evenement Details
        </h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.8; margin: 0;">
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
          <strong>Notitie:</strong> ${guestNotes}
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

    const { data: userRoles } = await adminClient
      .from('user_roles')
      .select('role, event_id')
      .eq('user_id', user.id);

    const isSuperAdmin = userRoles?.some(r => r.role === 'superadmin' || r.role === 'super_admin');
    const isAdmin = userRoles?.some(r => r.role === 'admin' || r.role === 'organizer');

    if (!isSuperAdmin && !isAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { order_id } = await req.json();

    if (!order_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing order_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .select(`
        *,
        events!inner(*)
      `)
      .eq('id', order_id)
      .eq('status', 'comped')
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ success: false, error: 'Guest ticket order not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const event = order.events;
    event.brand_name = null;
    if (event.brand_slug) {
      const { data: brandData } = await adminClient
        .from('brands')
        .select('name')
        .eq('slug', event.brand_slug)
        .maybeSingle();
      event.brand_name = brandData?.name || null;
    }

    if (!isSuperAdmin) {
      const hasEventAccess = userRoles?.some(r =>
        (r.role === 'admin' || r.role === 'organizer') &&
        (r.event_id === order.event_id || r.event_id === null)
      );

      if (!hasEventAccess) {
        return new Response(
          JSON.stringify({ success: false, error: 'No access to this event' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const { data: qrRecords, error: qrError } = await adminClient
      .from('guest_ticket_qrs')
      .select('*')
      .eq('order_id', order_id)
      .order('person_index', { ascending: true });

    if (qrError) {
      console.error('Failed to fetch QR records:', qrError);
    }

    const qrEntries: QrEntry[] = [];

    if (qrRecords && qrRecords.length > 0) {
      for (const qr of qrRecords) {
        let qrDataUrl = '';
        try {
          qrDataUrl = await generateQRCode(qr.qr_token);
        } catch (_e) {
          // toDataURL may not work in Deno - not needed for PDF
        }
        const entry: QrEntry = {
          id: qr.id,
          person_index: qr.person_index,
          qr_token: qr.qr_token,
          qr_data_url: qrDataUrl,
        };
        if (qr.seat_id) {
          entry.seat = {
            seat_id: qr.seat_id,
            section_name: qr.section_name || '',
            row_label: qr.row_label || '',
            seat_number: qr.seat_number || 0,
          };
        }
        qrEntries.push(entry);
      }
    }

    const recipientEmail = order.payer_email;
    const recipientName = order.payer_name;

    const { data: ticketRecord } = await adminClient
      .from('tickets')
      .select('id, public_token, assigned_table_id, table_note')
      .eq('order_id', order_id)
      .maybeSingle();

    let publicToken = ticketRecord?.public_token || '';
    if (!publicToken && ticketRecord?.id) {
      const newToken = crypto.randomUUID();
      await adminClient
        .from('tickets')
        .update({ public_token: newToken })
        .eq('id', ticketRecord.id);
      publicToken = newToken;
    }

    let tableInfo: TableInfo | null = null;
    if (ticketRecord?.assigned_table_id) {
      const { data: tableData } = await adminClient
        .from('floorplan_tables')
        .select('id, table_number, table_type, capacity')
        .eq('id', ticketRecord.assigned_table_id)
        .maybeSingle();
      if (tableData) tableInfo = tableData;
    }

    const tableNote = ticketRecord?.table_note || null;
    const guestNotes = order.metadata?.notes || null;

    if (qrEntries.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No QR codes found for this guest ticket' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let pdfAttachments: Array<{ filename: string; content: Uint8Array }> = [];
    try {
      const pdfBytes = await generateTicketsPDF(
        event,
        recipientName,
        qrEntries,
        order.order_number,
        tableInfo,
        tableNote,
        guestNotes
      );
      pdfAttachments = [{
        filename: `tickets-${order.order_number}.pdf`,
        content: pdfBytes
      }];
    } catch (pdfError) {
      console.error('[pdf] PDF generatie mislukt, mail wordt zonder PDF verstuurd:', pdfError.message);
    }

    const seatAssignmentsForEmail: SeatAssignment[] = qrEntries
      .filter(q => q.seat)
      .map(q => q.seat!);

    const emailHtml = buildMultiPersonEmail(
      event,
      recipientName,
      qrEntries.length,
      tableInfo,
      tableNote,
      guestNotes,
      publicToken,
      seatAssignmentsForEmail.length > 0 ? seatAssignmentsForEmail : undefined
    );

    await sendEmail({
      to: recipientEmail,
      subject: `Guest Tickets (${qrEntries.length}x): ${event.name}`,
      html: emailHtml,
      attachments: pdfAttachments.length > 0 ? pdfAttachments : undefined
    });

    await adminClient
      .from('orders')
      .update({
        email_sent: true,
        email_sent_at: new Date().toISOString(),
      })
      .eq('id', order_id);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Email with PDF resent successfully`,
        emails_sent: 1
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Resend guest ticket emails error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
