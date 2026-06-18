import { supabase } from './supabase';
import { storeTickets, clearEventData } from './database';

const PAGE_SIZE = 500;

export type DownloadProgress = {
  status: 'loading' | 'done' | 'error';
  downloaded: number;
  total: number;
  message: string;
};

export async function downloadEventTickets(
  eventId: string,
  onProgress: (progress: DownloadProgress) => void
): Promise<void> {
  onProgress({ status: 'loading', downloaded: 0, total: 0, message: 'Tickets laden...' });

  await clearEventData(eventId);

  const { count, error: countError } = await supabase
    .from('ticket_seats')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId);

  if (countError) {
    onProgress({ status: 'error', downloaded: 0, total: 0, message: `Fout: ${countError.message}` });
    return;
  }

  const total = count ?? 0;
  onProgress({ status: 'loading', downloaded: 0, total, message: `${total} tickets gevonden, downloaden...` });

  // Pre-fetch lookup data in separate simple queries (no nested joins)
  const ticketTypeMap = await loadTicketTypeMap(eventId);
  const sectionMap = await loadSectionMap(eventId);
  const sectionIds = [...sectionMap.keys()];
  const seatMap = await loadSeatMap(sectionIds);

  let downloaded = 0;
  let offset = 0;

  while (offset < total) {
    const { data, error } = await supabase
      .from('ticket_seats')
      .select(`
        id,
        ticket_number,
        qr_data,
        qr_token,
        ticket_code,
        seat_id,
        order_id
      `)
      .eq('event_id', eventId)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      onProgress({ status: 'error', downloaded, total, message: `Fout bij laden: ${error.message}` });
      return;
    }

    if (!data || data.length === 0) break;

    // Fetch order statuses for this batch
    const orderIds = [...new Set(data.map((t: any) => t.order_id).filter(Boolean))];
    const orderMap = await loadOrderBatch(orderIds);

    const tickets = data
      .filter((t: any) => orderMap.get(t.order_id)?.status === 'paid')
      .map((t: any) => {
        const seat = seatMap.get(t.seat_id);
        return {
          id: t.id,
          ticket_number: t.ticket_number,
          qr_data: t.qr_data,
          qr_token: t.qr_token,
          ticket_code: t.ticket_code,
          ticket_type_name: seat?.ticket_type_id ? ticketTypeMap.get(seat.ticket_type_id) ?? null : null,
          section_name: seat?.section_id ? sectionMap.get(seat.section_id) ?? null : null,
          row_label: seat?.row_label ?? null,
          seat_number: seat?.seat_number ?? null,
          seat_type: seat?.seat_type ?? null,
          holder_name: orderMap.get(t.order_id)?.payer_name ?? null,
        };
      });

    if (tickets.length > 0) {
      await storeTickets(eventId, tickets);
    }

    downloaded += data.length;
    offset += PAGE_SIZE;

    onProgress({
      status: 'loading',
      downloaded,
      total,
      message: `${downloaded} / ${total} tickets gedownload...`,
    });
  }

  onProgress({ status: 'done', downloaded, total, message: 'Klaar voor offline scanning' });
}

async function loadTicketTypeMap(eventId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data } = await supabase
    .from('ticket_types')
    .select('id, name')
    .eq('event_id', eventId);
  if (data) {
    for (const tt of data) {
      map.set(tt.id, tt.name);
    }
  }
  return map;
}

async function loadSectionMap(eventId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  // First get layout IDs for this event
  const { data: layouts } = await supabase
    .from('venue_layouts')
    .select('id')
    .eq('event_id', eventId);
  if (!layouts || layouts.length === 0) return map;

  const layoutIds = layouts.map(l => l.id);
  const { data } = await supabase
    .from('seat_sections')
    .select('id, name')
    .in('layout_id', layoutIds);
  if (data) {
    for (const s of data) {
      map.set(s.id, s.name);
    }
  }
  return map;
}

async function loadSeatMap(sectionIds: string[]): Promise<Map<string, { section_id: string | null; ticket_type_id: string | null; row_label: string | null; seat_number: number | null; seat_type: string | null }>> {
  const map = new Map();
  if (sectionIds.length === 0) return map;

  // Fetch seats for all sections in the event, batch by section IDs
  for (let i = 0; i < sectionIds.length; i += 50) {
    const chunk = sectionIds.slice(i, i + 50);
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data } = await supabase
        .from('seats')
        .select('id, section_id, ticket_type_id, row_label, seat_number, seat_type')
        .in('section_id', chunk)
        .range(offset, offset + pageSize - 1);
      if (!data || data.length === 0) break;
      for (const seat of data) {
        map.set(seat.id, seat);
      }
      if (data.length < pageSize) break;
      offset += pageSize;
    }
  }
  return map;
}

async function loadOrderBatch(orderIds: string[]): Promise<Map<string, { status: string; payer_name: string | null }>> {
  const map = new Map<string, { status: string; payer_name: string | null }>();
  if (orderIds.length === 0) return map;

  // Supabase .in() has a limit, batch in chunks of 100
  for (let i = 0; i < orderIds.length; i += 100) {
    const chunk = orderIds.slice(i, i + 100);
    const { data } = await supabase
      .from('orders')
      .select('id, status, payer_name')
      .in('id', chunk);
    if (data) {
      for (const o of data) {
        map.set(o.id, { status: o.status, payer_name: o.payer_name });
      }
    }
  }
  return map;
}
