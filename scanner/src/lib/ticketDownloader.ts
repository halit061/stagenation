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
        seat:seat_id (
          row_label,
          seat_number,
          seat_type,
          section:section_id (
            name,
            ticket_type:ticket_type_id (
              name
            )
          )
        ),
        order:order_id (
          payer_name,
          status
        )
      `)
      .eq('event_id', eventId)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      onProgress({ status: 'error', downloaded, total, message: `Fout bij laden: ${error.message}` });
      return;
    }

    if (!data || data.length === 0) break;

    const tickets = data
      .filter((t: any) => t.order?.status === 'paid')
      .map((t: any) => ({
        id: t.id,
        ticket_number: t.ticket_number,
        qr_data: t.qr_data,
        qr_token: t.qr_token,
        ticket_code: t.ticket_code,
        ticket_type_name: t.seat?.section?.ticket_type?.name ?? null,
        section_name: t.seat?.section?.name ?? null,
        row_label: t.seat?.row_label ?? null,
        seat_number: t.seat?.seat_number ?? null,
        seat_type: t.seat?.seat_type ?? null,
        holder_name: t.order?.payer_name ?? null,
      }));

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
