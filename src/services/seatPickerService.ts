import { supabase } from '../lib/supabaseClient';
import type { Seat, SeatSection, VenueLayout } from '../types/seats';

const SESSION_KEY = 'seat_picker_session_id';
const HOLD_KEY = 'seat_picker_hold';
const RATE_KEY = 'seat_picker_rate';

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export { getSessionId };

export interface HoldResult {
  success: boolean;
  hold_ids?: string[];
  expires_at?: string;
  error?: string;
  unavailable_seats?: string[];
}

interface StoredHold {
  hold_ids: string[];
  expires_at: string;
  event_id: string;
  session_id: string;
  extended: boolean;
  ticket_type_id?: string;
}

export function saveHoldToStorage(hold: StoredHold) {
  sessionStorage.setItem(HOLD_KEY, JSON.stringify(hold));
}

export function loadHoldFromStorage(): StoredHold | null {
  const raw = sessionStorage.getItem(HOLD_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearHoldStorage() {
  sessionStorage.removeItem(HOLD_KEY);
}

export function checkRateLimit(): { allowed: boolean; retryAfterMs: number } {
  const raw = sessionStorage.getItem(RATE_KEY);
  const now = Date.now();
  let attempts: number[] = [];
  if (raw) {
    try { attempts = JSON.parse(raw); } catch { attempts = []; }
  }
  attempts = attempts.filter(t => now - t < 600_000);
  if (attempts.length >= 5) {
    const oldest = attempts[0];
    return { allowed: false, retryAfterMs: 600_000 - (now - oldest) };
  }
  return { allowed: true, retryAfterMs: 0 };
}

export function recordRateAttempt() {
  const raw = sessionStorage.getItem(RATE_KEY);
  const now = Date.now();
  let attempts: number[] = [];
  if (raw) {
    try { attempts = JSON.parse(raw); } catch { attempts = []; }
  }
  attempts = attempts.filter(t => now - t < 600_000);
  attempts.push(now);
  sessionStorage.setItem(RATE_KEY, JSON.stringify(attempts));
}

export interface FloorplanObject {
  id: string;
  event_id: string | null;
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  font_color: string | null;
  font_size: number | null;
  font_weight: string | null;
  is_visible: boolean;
  is_active: boolean;
}

export async function fetchFloorplanObjects(eventId: string): Promise<FloorplanObject[]> {
  const { data, error } = await supabase
    .from('floorplan_objects')
    .select('id, event_id, type, object_type, name, label, x, y, width, height, rotation, color, font_color, font_size, font_weight, is_visible, is_active')
    .eq('event_id', eventId)
    .eq('is_active', true)
    .eq('is_visible', true)
    .order('display_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((o: any) => ({
    ...o,
    type: o.type || (o.object_type ? o.object_type.toUpperCase() : 'BAR'),
    name: o.name || o.label || o.type || 'Object',
  }));
}

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
  const results: Seat[] = [];
  const BATCH = 5;
  for (let i = 0; i < sectionIds.length; i += BATCH) {
    const batch = sectionIds.slice(i, i + BATCH);
    const promises = batch.map(async (secId) => {
      let allRows: Seat[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('seats')
          .select('*')
          .eq('section_id', secId)
          .eq('is_active', true)
          .order('row_label', { ascending: true })
          .order('seat_number', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const rows = data ?? [];
        allRows = allRows.concat(rows);
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      return allRows;
    });
    const batchResults = await Promise.all(promises);
    for (const rows of batchResults) {
      results.push(...rows);
    }
  }
  return results;
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

export async function holdSeatsAtomic(
  seatIds: string[],
  eventId: string,
): Promise<HoldResult> {
  const sessionId = getSessionId();
  const { data, error } = await supabase.rpc('hold_seats_atomic', {
    p_seat_ids: seatIds,
    p_event_id: eventId,
    p_user_id: null,
    p_session_id: sessionId,
    p_hold_minutes: 10,
  });

  if (error) throw error;
  return data as HoldResult;
}

export async function extendHolds(eventId: string): Promise<{ success: boolean; expires_at?: string }> {
  const sessionId = getSessionId();
  const { data, error } = await supabase.rpc('extend_seat_holds', {
    p_session_id: sessionId,
    p_event_id: eventId,
    p_extra_minutes: 5,
  });
  if (error) throw error;
  return data as { success: boolean; expires_at?: string };
}

export async function releaseSessionHolds(eventId: string): Promise<void> {
  const sessionId = getSessionId();
  await supabase.rpc('release_session_holds', {
    p_session_id: sessionId,
    p_event_id: eventId,
  });
  clearHoldStorage();
}

export function subscribeToSeatUpdates(
  layoutId: string,
  sectionIds: string[],
  onUpdate: (seat: Partial<Seat> & { id: string }) => void,
  onConnectionChange?: (status: 'connected' | 'reconnecting' | 'disconnected') => void,
) {
  const channel = supabase
    .channel('seats-realtime-' + layoutId)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'seats',
      },
      (payload) => {
        const newRow = payload.new as Partial<Seat> & { id: string; section_id?: string };
        if (newRow.id && newRow.section_id && sectionIds.includes(newRow.section_id)) {
          onUpdate(newRow);
        }
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        onConnectionChange?.('connected');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onConnectionChange?.('disconnected');
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function fetchTicketTypePricesForSections(sectionIds: string[]): Promise<Map<string, { ttName: string; price: number }>> {
  if (sectionIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('ticket_type_sections')
    .select('section_id, ticket_type_id, ticket_types(id, name, price)')
    .in('section_id', sectionIds);
  if (error) return new Map();
  const result = new Map<string, { ttName: string; price: number }>();
  for (const row of (data ?? []) as any[]) {
    const tt = row.ticket_types;
    if (tt && tt.price && !result.has(row.section_id)) {
      result.set(row.section_id, { ttName: tt.name, price: tt.price / 100 });
    }
  }
  return result;
}

export async function fetchLinkedSectionIds(ticketTypeId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('ticket_type_sections')
    .select('section_id')
    .eq('ticket_type_id', ticketTypeId);
  if (error) throw error;
  return (data ?? []).map(r => r.section_id);
}

export interface TicketTypeColor {
  id: string;
  name: string;
  color: string;
  price: number;
}

export async function fetchTicketTypeColorsForEvent(eventId: string): Promise<TicketTypeColor[]> {
  const { data, error } = await supabase
    .from('ticket_types')
    .select('id, name, color, price')
    .eq('event_id', eventId)
    .eq('is_active', true);
  if (error) return [];
  return (data ?? []).map((tt: any) => ({
    id: tt.id,
    name: tt.name,
    color: tt.color || null,
    price: (tt.price || 0) / 100,
  }));
}

export async function refreshAllSeats(sectionIds: string[]): Promise<Seat[]> {
  return fetchSeats(sectionIds);
}
