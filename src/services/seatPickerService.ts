import { supabase } from '../lib/supabaseClient';
import type { Seat, SeatSection, VenueLayout } from '../types/seats';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function getSessionId(): string {
  const KEY = 'seat_picker_session_id';
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

export { getSessionId };

export async function fetchLayoutByEvent(eventId: string): Promise<VenueLayout | null> {
  const { data, error } = await supabase
    .from('venue_layouts')
    .select('*')
    .eq('event_id', eventId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchSections(layoutId: string): Promise<SeatSection[]> {
  const { data, error } = await supabase
    .from('seat_sections')
    .select('*')
    .eq('layout_id', layoutId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchSeats(sectionIds: string[]): Promise<Seat[]> {
  if (sectionIds.length === 0) return [];
  const { data, error } = await supabase
    .from('seats')
    .select('*')
    .in('section_id', sectionIds)
    .eq('is_active', true)
    .order('row_label', { ascending: true })
    .order('seat_number', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchEventInfo(eventId: string) {
  const { data, error } = await supabase
    .from('events')
    .select('id, name, slug, start_date, end_date, location, venue_name')
    .eq('id', eventId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface HoldResult {
  hold_ids: string[];
  expires_at: string;
}

export async function holdSeatsPublic(
  seatIds: string[],
  eventId: string,
): Promise<HoldResult> {
  const sessionId = getSessionId();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/hold-seats`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({
      seat_ids: seatIds,
      event_id: eventId,
      session_id: sessionId,
      hold_minutes: 10,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Hold failed' }));
    throw new Error(err.error || 'Hold failed');
  }

  return res.json();
}

export async function releaseHoldsPublic(holdIds: string[]): Promise<void> {
  const sessionId = getSessionId();
  await fetch(`${SUPABASE_URL}/functions/v1/hold-seats/release`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({
      hold_ids: holdIds,
      session_id: sessionId,
    }),
  });
}

export function subscribeToSeatUpdates(
  sectionIds: string[],
  onUpdate: (seatId: string, newStatus: string) => void,
) {
  const channel = supabase
    .channel('public-seat-changes')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'seats',
      },
      (payload) => {
        const newRow = payload.new as Partial<Seat>;
        if (newRow.id && newRow.section_id && sectionIds.includes(newRow.section_id) && newRow.status) {
          onUpdate(newRow.id, newRow.status);
        }
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
