import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

export interface TicketPdfSeat {
  row_label: string;
  seat_number: number;
  section_name: string;
  section_color: string;
  price: number;
  ticket_code: string | null;
  ticket_number: string | null;
  qr_data: string | null;
  seat_type?: string;
  ticket_type_name?: string;
}

export interface TicketPdfOrder {
  order_number: string;
  payer_name: string;
  payer_email: string;
  verification_code?: string | null;
}

export interface TicketPdfEvent {
  name: string;
  start_date: string;
  location?: string;
  venue_name?: string;
}

export interface TicketPdfSection {
  id: string;
  name: string;
  color: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
}

function formatEventDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatEventTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

async function generateQRDataUrl(data: string): Promise<string> {
  try {
    return await QRCode.toDataURL(data, { width: 480, margin: 2, errorCorrectionLevel: 'M' });
  } catch {
    return '';
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return [r, g, b];
}

function drawMiniVenueMap(
  doc: jsPDF,
  sections: TicketPdfSection[],
  highlightSectionName: string,
  mapX: number,
  mapY: number,
  mapW: number,
  mapH: number,
) {
  if (sections.length === 0) return;

  const minX = Math.min(...sections.map(s => s.position_x));
  const minY = Math.min(...sections.map(s => s.position_y));
  const maxX = Math.max(...sections.map(s => s.position_x + s.width));
  const maxY = Math.max(...sections.map(s => s.position_y + s.height));
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const scaleX = mapW / rangeX;
  const scaleY = mapH / rangeY;
  const scale = Math.min(scaleX, scaleY) * 0.9;

  const fittedW = rangeX * scale;
  const fittedH = rangeY * scale;
  const offsetX = mapX + (mapW - fittedW) / 2;
  const offsetY = mapY + (mapH - fittedH) / 2;

  doc.setDrawColor(200);
  doc.setLineWidth(0.2);
  doc.roundedRect(mapX - 1, mapY - 1, mapW + 2, mapH + 2, 1, 1);

  for (const sec of sections) {
    const sx = offsetX + (sec.position_x - minX) * scale;
    const sy = offsetY + (sec.position_y - minY) * scale;
    const sw = sec.width * scale;
    const sh = sec.height * scale;

    const isHighlight = sec.name === highlightSectionName;
    const [r, g, b] = hexToRgb(sec.color || '#94a3b8');

    if (isHighlight) {
      doc.setFillColor(r, g, b);
      doc.setDrawColor(0);
      doc.setLineWidth(0.5);
    } else {
      doc.setFillColor(Math.min(r + 80, 240), Math.min(g + 80, 240), Math.min(b + 80, 240));
      doc.setDrawColor(180);
      doc.setLineWidth(0.15);
    }

    doc.roundedRect(sx, sy, sw, sh, 0.5, 0.5, 'FD');

    if (sw > 8 && sh > 4) {
      doc.setFontSize(3.5);
      doc.setFont('helvetica', isHighlight ? 'bold' : 'normal');
      doc.setTextColor(isHighlight ? 255 : 100);
      const label = sec.name.length > 12 ? sec.name.slice(0, 11) + '..' : sec.name;
      doc.text(label, sx + sw / 2, sy + sh / 2 + 1, { align: 'center' });
    }
  }

  doc.setTextColor(0);
}

export async function generateTicketsPdf(
  order: TicketPdfOrder,
  event: TicketPdfEvent,
  seats: TicketPdfSeat[],
  venueSections?: TicketPdfSection[],
): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();

  for (let i = 0; i < seats.length; i++) {
    if (i > 0) doc.addPage('a4', 'landscape');
    const seat = seats[i];
    const ticketNumber = seat.ticket_number || seat.ticket_code || '';
    const splitX = pw * 0.62;
    const margin = 12;

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pw, 28, 'F');

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255);
    doc.text('STAGENATION', margin, 14);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text('TOEGANGSTICKET', margin, 21);

    if (ticketNumber) {
      doc.setFontSize(9);
      doc.setFont('courier', 'bold');
      doc.setTextColor(56, 189, 248);
      doc.text(ticketNumber, splitX - 8, 14, { align: 'right' });
    }

    let y = 36;

    doc.setTextColor(0);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    const eventName = event.name || 'Event';
    doc.text(eventName, margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80);
    if (event.start_date) {
      doc.text(formatEventDate(event.start_date), margin, y);
      doc.text('Aanvang: ' + formatEventTime(event.start_date), margin + 95, y);
      y += 6;
    }
    const venue = [event.venue_name, event.location].filter(Boolean).join(' - ');
    if (venue) {
      doc.text(venue, margin, y);
      y += 8;
    } else {
      y += 4;
    }

    doc.setDrawColor(200);
    doc.setLineWidth(0.3);
    doc.line(margin, y, splitX - 10, y);
    y += 8;

    const sectionColor = seat.section_color || '#3b82f6';
    const [sr, sg, sb] = hexToRgb(sectionColor);
    doc.setFillColor(sr, sg, sb);
    doc.roundedRect(margin, y - 4, 3, 16, 1, 1, 'F');

    const labelX = margin + 8;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text(seat.section_name.toUpperCase(), labelX, y + 1);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60);
    doc.text(`Rij ${seat.row_label}   |   Stoel ${seat.seat_number}`, labelX, y + 8);
    y += 18;

    if (seat.ticket_type_name) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(sr, sg, sb);
      doc.text(seat.ticket_type_name, margin, y);
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('EUR ' + seat.price.toFixed(2), splitX - 10, y, { align: 'right' });
    y += 10;

    doc.setDrawColor(200);
    doc.setLineWidth(0.3);
    doc.line(margin, y, splitX - 10, y);
    y += 6;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80);
    doc.text(order.payer_name, margin, y);
    y += 5;
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text('Bestelling: ' + order.order_number, margin, y);
    y += 8;

    if (seat.seat_type === 'vip') {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(180, 120, 0);
      doc.text('VIP', margin, y);
      y += 6;
    }

    const footerY = ph - 14;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150);
    doc.text('Strikt persoonlijk, niet overdraagbaar.', margin, footerY);
    doc.text('Voorwaarden: stagenation.be/terms  |  Privacy: stagenation.be/privacy', margin, footerY + 4);

    doc.setDrawColor(180);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([1.5, 1.5], 0);
    doc.line(splitX, 28, splitX, ph);
    doc.setLineDashPattern([], 0);

    const rightMargin = splitX + 10;
    const rightW = pw - splitX - 20;

    const qrValue = seat.qr_data || seat.ticket_code || order.order_number;
    const qrDataUrl = await generateQRDataUrl(qrValue);

    let ry = 36;
    if (qrDataUrl) {
      const qrSize = Math.min(rightW, 50);
      const qrX = rightMargin + (rightW - qrSize) / 2;
      doc.addImage(qrDataUrl, 'PNG', qrX, ry, qrSize, qrSize);
      ry += qrSize + 4;
    }

    if (ticketNumber) {
      doc.setFontSize(10);
      doc.setFont('courier', 'bold');
      doc.setTextColor(0);
      doc.text(ticketNumber, rightMargin + rightW / 2, ry, { align: 'center' });
      ry += 10;
    }

    if (venueSections && venueSections.length > 0) {
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100);
      doc.text('UW ZITPLAATS', rightMargin + rightW / 2, ry, { align: 'center' });
      ry += 4;

      const mapH = Math.min(ph - ry - 20, 45);
      drawMiniVenueMap(doc, venueSections, seat.section_name, rightMargin, ry, rightW, mapH);
      ry += mapH + 4;
    }

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150);
    doc.text('stagenation.be', rightMargin + rightW / 2, ph - 10, { align: 'center' });
  }

  doc.save('StageNation-Tickets-' + order.order_number + '.pdf');
}
