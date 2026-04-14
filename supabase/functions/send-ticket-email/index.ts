import { createClient } from 'npm:@supabase/supabase-js@2';
import { Resend } from 'npm:resend@4.0.0';
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

function pdfEscape(str: string): string {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function pdfTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.5;
}

function pdfCenterX(text: string, fontSize: number, pageWidth: number): number {
  return (pageWidth - pdfTextWidth(text, fontSize)) / 2;
}

interface PdfObject {
  id: number;
  offset: number;
  content: string;
}

function buildPurePdf(pages: string[][], qrImages: (Uint8Array | null)[][]): string {
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const objects: PdfObject[] = [];
  let nextId = 1;

  function addObj(content: string): number {
    const id = nextId++;
    objects.push({ id, offset: 0, content: `${id} 0 obj\n${content}\nendobj\n` });
    return id;
  }

  const catalogId = addObj('<< /Type /Catalog /Pages 2 0 R >>');
  const pagesObjId = nextId++;
  objects.push({ id: pagesObjId, offset: 0, content: '' });

  const fontId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontBoldId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const fontMonoId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>');

  const pageIds: number[] = [];

  for (let pi = 0; pi < pages.length; pi++) {
    const lines = pages[pi];
    const pageQrImages = qrImages[pi] || [];

    const imageObjIds: number[] = [];
    for (const imgData of pageQrImages) {
      if (!imgData) continue;
      const streamContent = Array.from(imgData).map(b => String.fromCharCode(b)).join('');
      const imgId = addObj(
        `<< /Type /XObject /Subtype /Image /Width 300 /Height 300 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${imgData.length * 2} >>\nstream\n${Array.from(imgData).map(b => b.toString(16).padStart(2, '0')).join('')}>\nendstream`
      );
      imageObjIds.push(imgId);
    }

    let streamText = '';
    let imgIndex = 0;

    for (const line of lines) {
      if (line.startsWith('%%IMAGE%%')) {
        const parts = line.split('|');
        const x = parseFloat(parts[1]);
        const y = parseFloat(parts[2]);
        const w = parseFloat(parts[3]);
        const h = parseFloat(parts[4]);
        if (imgIndex < imageObjIds.length) {
          streamText += `q ${w} 0 0 ${h} ${x} ${y} cm /Img${imgIndex} Do Q\n`;
          imgIndex++;
        }
        continue;
      }
      streamText += line + '\n';
    }

    const streamBytes = new TextEncoder().encode(streamText);
    const contentsId = addObj(
      `<< /Length ${streamBytes.length} >>\nstream\n${streamText}endstream`
    );

    let xobjDict = '';
    if (imageObjIds.length > 0) {
      const entries = imageObjIds.map((id, i) => `/Img${i} ${id} 0 R`).join(' ');
      xobjDict = ` /XObject << ${entries} >>`;
    }

    const pageId = addObj(
      `<< /Type /Page /Parent ${pagesObjId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentsId} 0 R /Resources << /Font << /F1 ${fontId} 0 R /F2 ${fontBoldId} 0 R /F3 ${fontMonoId} 0 R >>${xobjDict} >> >>`
    );
    pageIds.push(pageId);
  }

  const kidsStr = pageIds.map(id => `${id} 0 R`).join(' ');
  const pagesObj = objects.find(o => o.id === pagesObjId)!;
  pagesObj.content = `${pagesObjId} 0 obj\n<< /Type /Pages /Kids [${kidsStr}] /Count ${pageIds.length} >>\nendobj\n`;

  let body = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  for (const obj of objects) {
    obj.offset = body.length;
    body += obj.content;
  }

  const xrefOffset = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const obj of objects) {
    xref += `${String(obj.offset).padStart(10, '0')} 00000 n \n`;
  }

  body += xref;
  body += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const bytes = new TextEncoder().encode(body);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function getQrRgbBytes(data: string): Promise<Uint8Array | null> {
  try {
    const buffer = await QRCode.toBuffer(data, { width: 300, margin: 2, type: 'png' });
    const png = new Uint8Array(buffer);

    const width = 300;
    const height = 300;
    const rgb = new Uint8Array(width * height * 3);

    let dataStart = 8;
    const chunks: Uint8Array[] = [];
    while (dataStart < png.length) {
      const len = (png[dataStart] << 24) | (png[dataStart+1] << 16) | (png[dataStart+2] << 8) | png[dataStart+3];
      const type = String.fromCharCode(png[dataStart+4], png[dataStart+5], png[dataStart+6], png[dataStart+7]);
      if (type === 'IDAT') {
        chunks.push(png.slice(dataStart + 8, dataStart + 8 + len));
      }
      if (type === 'IEND') break;
      dataStart += 12 + len;
    }

    if (chunks.length === 0) return null;

    const compressed = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      compressed.set(chunk, offset);
      offset += chunk.length;
    }

    const ds = new DecompressionStream('deflate');
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();

    writer.write(compressed);
    writer.close();

    const decompressedChunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      decompressedChunks.push(value);
    }

    const raw = new Uint8Array(decompressedChunks.reduce((a, c) => a + c.length, 0));
    let rOff = 0;
    for (const c of decompressedChunks) {
      raw.set(c, rOff);
      rOff += c.length;
    }

    const bytesPerPixel = 4;
    const stride = 1 + width * bytesPerPixel;
    for (let row = 0; row < height; row++) {
      const rowStart = row * stride + 1;
      for (let col = 0; col < width; col++) {
        const srcIdx = rowStart + col * bytesPerPixel;
        const dstIdx = (row * width + col) * 3;
        if (srcIdx + 2 < raw.length) {
          rgb[dstIdx] = raw[srcIdx];
          rgb[dstIdx + 1] = raw[srcIdx + 1];
          rgb[dstIdx + 2] = raw[srcIdx + 2];
        }
      }
    }

    return rgb;
  } catch (e) {
    console.error('[pdf] QR RGB extraction failed:', e.message);
    return null;
  }
}

function buildPageLines(
  textBlocks: { text: string; x: number; y: number; font: string; size: number; color?: number }[],
  lineDraws: { x1: number; y1: number; x2: number; y2: number; gray?: number }[],
  rectDraws?: { x: number; y: number; w: number; h: number }[],
): string[] {
  const cmds: string[] = [];
  for (const ld of lineDraws) {
    const g = (ld.gray ?? 200) / 255;
    cmds.push(`${g.toFixed(2)} ${g.toFixed(2)} ${g.toFixed(2)} RG 0.5 w ${ld.x1.toFixed(1)} ${ld.y1.toFixed(1)} m ${ld.x2.toFixed(1)} ${ld.y2.toFixed(1)} l S`);
  }
  if (rectDraws) {
    for (const r of rectDraws) {
      cmds.push(`0 0 0 RG 0.5 w ${r.x.toFixed(1)} ${r.y.toFixed(1)} ${r.w.toFixed(1)} ${r.h.toFixed(1)} re S`);
    }
  }
  for (const tb of textBlocks) {
    const c = (tb.color ?? 0) / 255;
    const fontRef = tb.font === 'bold' ? '/F2' : tb.font === 'mono' ? '/F3' : '/F1';
    cmds.push(`BT ${c.toFixed(2)} ${c.toFixed(2)} ${c.toFixed(2)} rg ${fontRef} ${tb.size} Tf ${tb.x.toFixed(1)} ${tb.y.toFixed(1)} Td (${pdfEscape(tb.text)}) Tj ET`);
  }
  return cmds;
}

async function buildTicketPdf(order: any, event: any, tickets: any[]): Promise<string> {
  const PW = 595.28;
  const PH = 841.89;
  const M = 56.69;
  const allPages: string[][] = [];
  const allQr: (Uint8Array | null)[][] = [];

  for (const ticket of tickets) {
    const texts: { text: string; x: number; y: number; font: string; size: number; color?: number }[] = [];
    const lines: { x1: number; y1: number; x2: number; y2: number; gray?: number }[] = [];
    const cmds: string[] = [];
    let y = PH - M;

    const title = event.name || 'Event';
    texts.push({ text: title, x: pdfCenterX(title, 18, PW), y, font: 'bold', size: 18 });
    y -= 20;

    lines.push({ x1: M, y1: y, x2: PW - M, y2: y });
    y -= 16;

    const details = [
      { label: 'Datum:', value: formatDate(event.start_date) },
      { label: 'Tijd:', value: formatTime(event.start_date) },
      { label: 'Locatie:', value: event.location || '' },
      { label: 'Ordernummer:', value: order.order_number || '' },
      { label: 'Ticket:', value: ticket.ticket_types?.name || 'Ticket' },
      { label: 'Ticketnummer:', value: ticket.ticket_number || '' },
      { label: 'Naam:', value: ticket.holder_name || order.payer_name || '' },
      { label: 'Email:', value: ticket.holder_email || order.payer_email || '' },
    ];

    for (const d of details) {
      if (!d.value) continue;
      texts.push({ text: d.label, x: M, y, font: 'bold', size: 11 });
      texts.push({ text: d.value, x: M + 90, y, font: 'normal', size: 11 });
      y -= 16;
    }

    y -= 8;
    lines.push({ x1: M, y1: y, x2: PW - M, y2: y });
    y -= 16;

    const qrData = ticket.qr_data || ticket.token || ticket.id;
    const qrRgb = await getQrRgbBytes(qrData);
    const pageQr: (Uint8Array | null)[] = [];
    if (qrRgb) {
      const qrPts = 150;
      const qrX = (PW - qrPts) / 2;
      cmds.push(`%%IMAGE%%|${qrX}|${y - qrPts}|${qrPts}|${qrPts}`);
      pageQr.push(qrRgb);
      y -= qrPts + 14;
    }

    const footerText = 'Toon deze QR-code bij de ingang. Elk ticket kan slechts 1x gescand worden.';
    texts.push({ text: footerText, x: pdfCenterX(footerText, 8, PW), y, font: 'normal', size: 8, color: 120 });

    const pageCmds = buildPageLines(texts, lines);
    allPages.push([...pageCmds, ...cmds]);
    allQr.push(pageQr);
  }

  return buildPurePdf(allPages, allQr);
}

async function buildSeatTicketPdf(order: any, event: any, seatTickets: any[]): Promise<string> {
  const PW = 595.28;
  const PH = 841.89;
  const M = 56.69;
  const allPages: string[][] = [];
  const allQr: (Uint8Array | null)[][] = [];

  for (const ts of seatTickets) {
    const sectionName = ts.seats?.seat_sections?.name || '';
    const rowLabel = ts.seats?.row_label || '-';
    const seatNumber = String(ts.seats?.seat_number ?? '-');
    const pricePaid = parseFloat(ts.price_paid || 0).toFixed(2);
    const ticketCode = ts.ticket_code || '';
    const seatType = ts.seats?.seat_type || 'regular';

    const texts: { text: string; x: number; y: number; font: string; size: number; color?: number }[] = [];
    const lines: { x1: number; y1: number; x2: number; y2: number; gray?: number }[] = [];
    const rects: { x: number; y: number; w: number; h: number }[] = [];
    const cmds: string[] = [];
    let y = PH - M;

    const brand = 'STAGENATION';
    texts.push({ text: brand, x: pdfCenterX(brand, 20, PW), y, font: 'bold', size: 20 });
    y -= 18;

    const sub = 'TOEGANGSTICKET';
    texts.push({ text: sub, x: pdfCenterX(sub, 11, PW), y, font: 'normal', size: 11, color: 120 });
    y -= 14;

    lines.push({ x1: M, y1: y, x2: PW - M, y2: y });
    y -= 20;

    const eventName = event.name || 'Event';
    texts.push({ text: eventName, x: pdfCenterX(eventName, 17, PW), y, font: 'bold', size: 17 });
    y -= 16;

    if (event.start_date) {
      const dateTime = formatDate(event.start_date) + ' - ' + formatTime(event.start_date);
      texts.push({ text: dateTime, x: pdfCenterX(dateTime, 10, PW), y, font: 'normal', size: 10, color: 80 });
      y -= 14;
    }
    const venue = [event.venue_name, event.location].filter(Boolean).join(', ');
    if (venue) {
      texts.push({ text: venue, x: pdfCenterX(venue, 10, PW), y, font: 'normal', size: 10, color: 80 });
      y -= 18;
    } else {
      y -= 8;
    }

    const boxW = PW - M * 2 - 40;
    const boxH = 80;
    const boxX = M + 20;
    rects.push({ x: boxX, y: y - boxH, w: boxW, h: boxH });

    let by = y - 18;
    const labelX = boxX + 12;
    const valX = labelX + 70;

    texts.push({ text: 'Sectie:', x: labelX, y: by, font: 'bold', size: 11 });
    texts.push({ text: sectionName, x: valX, y: by, font: 'normal', size: 11 });
    by -= 16;

    texts.push({ text: 'Rij:', x: labelX, y: by, font: 'bold', size: 11 });
    texts.push({ text: rowLabel, x: valX, y: by, font: 'normal', size: 11 });
    by -= 16;

    texts.push({ text: 'Stoel:', x: labelX, y: by, font: 'bold', size: 11 });
    texts.push({ text: seatNumber, x: valX, y: by, font: 'normal', size: 11 });
    by -= 16;

    texts.push({ text: 'Prijs:', x: labelX, y: by, font: 'bold', size: 11 });
    texts.push({ text: 'EUR ' + pricePaid, x: valX, y: by, font: 'normal', size: 11 });

    if (seatType === 'vip') {
      texts.push({ text: 'VIP', x: boxX + boxW - 30, y: y - 18, font: 'bold', size: 9, color: 160 });
    }

    y -= boxH + 16;

    const qrValue = ts.qr_data || ticketCode || ts.id;
    const qrRgb = await getQrRgbBytes(qrValue);
    const pageQr: (Uint8Array | null)[] = [];
    if (qrRgb) {
      const qrPts = 140;
      const qrX = (PW - qrPts) / 2;
      cmds.push(`%%IMAGE%%|${qrX}|${y - qrPts}|${qrPts}|${qrPts}`);
      pageQr.push(qrRgb);
      y -= qrPts + 10;
    }

    if (ticketCode) {
      texts.push({ text: ticketCode, x: pdfCenterX(ticketCode, 13, PW), y, font: 'mono', size: 13 });
      y -= 20;
    }

    lines.push({ x1: M, y1: y, x2: PW - M, y2: y });
    y -= 14;

    const orderLine = 'Bestelnummer: ' + (order.order_number || '');
    texts.push({ text: orderLine, x: pdfCenterX(orderLine, 8, PW), y, font: 'normal', size: 8, color: 100 });
    y -= 12;

    const nameLine = 'Naam: ' + (order.payer_name || '');
    texts.push({ text: nameLine, x: pdfCenterX(nameLine, 8, PW), y, font: 'normal', size: 8, color: 100 });
    y -= 14;

    const f1 = 'Dit ticket is uniek en kan slechts een keer gescand worden.';
    texts.push({ text: f1, x: pdfCenterX(f1, 7, PW), y, font: 'normal', size: 7, color: 100 });
    y -= 10;
    const f2 = 'Toon dit ticket bij de ingang op je telefoon of geprint.';
    texts.push({ text: f2, x: pdfCenterX(f2, 7, PW), y, font: 'normal', size: 7, color: 100 });

    const pageCmds = buildPageLines(texts, lines, rects);
    allPages.push([...pageCmds, ...cmds]);
    allQr.push(pageQr);
  }

  return buildPurePdf(allPages, allQr);
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
        .select('*, seats(id, row_label, seat_number, section_id, seat_sections(id, name, color, price_category, price_amount))')
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
        const pdfBase64 = await buildSeatTicketPdf(order, event, seatTickets);
        const filename = `StageNation-Tickets-${order.order_number || 'tickets'}.pdf`;
        pdfAttachments = [{ filename, content: pdfBase64 }];
      } catch (pdfErr: any) {
        console.error('PDF: Seat ticket generation failed, sending without attachment:', pdfErr.message);
      }
    } else if (hasTickets && tickets.length > 0) {
      try {
        const pdfBase64 = await buildTicketPdf(order, event, tickets);
        const filename = `StageNation-Tickets-${order.order_number || 'tickets'}.pdf`;
        pdfAttachments = [{ filename, content: pdfBase64 }];
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
