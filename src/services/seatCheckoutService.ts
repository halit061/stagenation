import { supabase } from '../lib/supabaseClient';
import { getSessionId, loadHoldFromStorage, clearHoldStorage } from './seatPickerService';

export interface SeatOrderResult {
  success: boolean;
  order_id?: string;
  order_number?: string;
  error?: string;
}

export interface SeatOrderData {
  eventId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  subtotal: number;
  serviceFee: number;
  totalAmount: number;
  paymentMethod: string;
  notes: string;
  seatIds: string[];
  seatPrices: number[];
}

export async function validateHoldsActive(sessionId: string, eventId: string): Promise<{
  valid: boolean;
  activeCount: number;
}> {
  const { data, error } = await supabase
    .from('seat_holds')
    .select('id, seat_id')
    .eq('session_id', sessionId)
    .eq('event_id', eventId)
    .eq('status', 'held');

  if (error) throw error;
  const active = (data ?? []).filter((h: any) => true);
  return { valid: active.length > 0, activeCount: active.length };
}

export async function createSeatOrder(order: SeatOrderData): Promise<SeatOrderResult> {
  const sessionId = getSessionId();

  const { data, error } = await supabase.rpc('create_seat_order_atomic', {
    p_event_id: order.eventId,
    p_customer_first_name: order.firstName,
    p_customer_last_name: order.lastName,
    p_customer_email: order.email,
    p_customer_phone: order.phone || null,
    p_subtotal: order.subtotal,
    p_service_fee: order.serviceFee,
    p_total_amount: order.totalAmount,
    p_payment_method: order.paymentMethod,
    p_notes: order.notes || null,
    p_session_id: sessionId,
    p_seat_ids: order.seatIds,
    p_seat_prices: order.seatPrices,
  });

  if (error) throw error;
  const result = data as SeatOrderResult;

  if (result.success) {
    clearHoldStorage();
  }

  return result;
}

export async function fetchOrderById(orderId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function fetchOrderSeats(orderId: string) {
  const { data, error } = await supabase
    .from('ticket_seats')
    .select(`
      id,
      seat_id,
      event_id,
      price_paid,
      assigned_at
    `)
    .eq('ticket_id', orderId);

  if (error) throw error;
  return data ?? [];
}

export async function fetchSeatsForOrder(seatIds: string[]) {
  if (seatIds.length === 0) return [];
  const { data, error } = await supabase
    .from('seats')
    .select('id, row_label, seat_number, seat_type, section_id')
    .in('id', seatIds);

  if (error) throw error;
  return data ?? [];
}

export async function fetchSectionsForOrder(sectionIds: string[]) {
  if (sectionIds.length === 0) return [];
  const { data, error } = await supabase
    .from('seat_sections')
    .select('id, name, color, price_category, price_amount')
    .in('id', sectionIds);

  if (error) throw error;
  return data ?? [];
}

export function hasActiveHold(): boolean {
  const stored = loadHoldFromStorage();
  if (!stored) return false;
  const remaining = new Date(stored.expires_at).getTime() - Date.now();
  return remaining > 0;
}

export function getHoldEventId(): string | null {
  const stored = loadHoldFromStorage();
  return stored?.event_id ?? null;
}
