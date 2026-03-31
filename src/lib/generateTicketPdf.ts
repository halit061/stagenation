import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

interface TicketPdfSeat {
  row_label: string;
  seat_number: number;
  section_name: string;
  section_color: string;
  price: number;
  ticket_code: string | null;
  qr_data: string | null;
  seat_type?: string;
}

interface TicketPdfOrder {
  order_number: string;
  payer_name: string;
  payer_email: string;
  verification_code?: string | null;
}

interface TicketPdfEvent {
  name: string;
  start_date: string;
  location?: string;
  venue_name?: string;
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
    return await QRCode.toDataURL(data, { width: 400, margin: 2 });
  } catch {
    return '';
  }
}

export async function generateTicketsPdf(
  order: TicketPdfOrder,
  event: TicketPdfEvent,
  seats: TicketPdfSeat[],
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const margin = 20;

  for (let i = 0; i < seats.length; i++) {
    if (i > 0) doc.addPage();
    const seat = seats[i];
    let y = 22;

    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('STAGENATION', pw / 2, y, { align: 'center' });
    y += 10;

    doc.setFontSize(13);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120);
    doc.text('TOEGANGSTICKET', pw / 2, y, { align: 'center' });
    y += 8;

    doc.setDrawColor(200);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pw - margin, y);
    y += 12;

    doc.setTextColor(0);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(event.name || 'Event', pw / 2, y, { align: 'center' });
    y += 10;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80);
    if (event.start_date) {
      doc.text(formatEventDate(event.start_date) + ' - ' + formatEventTime(event.start_date), pw / 2, y, { align: 'center' });
      y += 7;
    }
    const venue = [event.venue_name, event.location].filter(Boolean).join(', ');
    if (venue) {
      doc.text(venue, pw / 2, y, { align: 'center' });
      y += 10;
    } else {
      y += 4;
    }

    doc.setDrawColor(0);
    doc.setLineWidth(0.4);
    doc.roundedRect(margin + 10, y, pw - margin * 2 - 20, 46, 3, 3);

    const boxLeft = margin + 18;
    const valLeft = boxLeft + 38;
    let by = y + 12;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('Sectie:', boxLeft, by);
    doc.setFont('helvetica', 'normal');
    doc.text(seat.section_name, valLeft, by);
    by += 8;

    doc.setFont('helvetica', 'bold');
    doc.text('Rij:', boxLeft, by);
    doc.setFont('helvetica', 'normal');
    doc.text(seat.row_label, valLeft, by);
    by += 8;

    doc.setFont('helvetica', 'bold');
    doc.text('Stoel:', boxLeft, by);
    doc.setFont('helvetica', 'normal');
    doc.text(String(seat.seat_number), valLeft, by);
    by += 8;

    doc.setFont('helvetica', 'bold');
    doc.text('Prijs:', boxLeft, by);
    doc.setFont('helvetica', 'normal');
    doc.text('EUR ' + seat.price.toFixed(2), valLeft, by);

    if (seat.seat_type === 'vip') {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(180, 120, 0);
      doc.text('VIP', pw - margin - 18, y + 12);
      doc.setTextColor(0);
    }

    y += 54;

    const qrValue = seat.qr_data || seat.ticket_code || order.order_number;
    const qrDataUrl = await generateQRDataUrl(qrValue);
    if (qrDataUrl) {
      const qrSize = 55;
      const qrX = (pw - qrSize) / 2;
      doc.addImage(qrDataUrl, 'PNG', qrX, y, qrSize, qrSize);
      y += qrSize + 6;
    }

    if (seat.ticket_code) {
      doc.setFontSize(14);
      doc.setFont('courier', 'bold');
      doc.setTextColor(0);
      doc.text(seat.ticket_code, pw / 2, y, { align: 'center' });
      y += 12;
    }

    doc.setDrawColor(200);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pw - margin, y);
    y += 8;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text('Bestelnummer: ' + order.order_number, pw / 2, y, { align: 'center' });
    y += 5;
    doc.text('Naam: ' + order.payer_name, pw / 2, y, { align: 'center' });
    y += 8;
    doc.setFontSize(8);
    doc.text('Dit ticket is uniek en kan slechts een keer gescand worden.', pw / 2, y, { align: 'center' });
    y += 5;
    doc.text('Toon dit ticket bij de ingang op je telefoon of geprint.', pw / 2, y, { align: 'center' });
  }

  doc.save('StageNation-Tickets-' + order.order_number + '.pdf');
}
