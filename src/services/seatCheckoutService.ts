import { supabase } from '../lib/supabaseClient';
import { getSessionId, loadHoldFromStorage, clearHoldStorage } from './seatPickerService';

export interface SeatOrderResult {
  success: boolean;
  order_id?: string;
  order_number?: string;
  checkoutUrl?: string;
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
  ticketTypeId?: string;
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
  const active = data ?? [];
  return { valid: active.length > 0, activeCount: active.length };
}

export async function createSeatOrder(order: SeatOrderData): Promise<SeatOrderResult> {
  const sessionId = getSessionId();

  const edgeUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-seat-order`;
  const edgeRes = await fetch(edgeUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
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
      p_ticket_type_id: order.ticketTypeId || null,
    }),
  });

  if (!edgeRes.ok) {
    const errBody = await edgeRes.json().catch(() => ({}));
    throw new Error(errBody.error || 'Failed to create seat order');
  }

  const rpcResult = await edgeRes.json() as any;

  if (!rpcResult.success) {
    return { success: false, error: rpcResult.error };
  }

  const orderId = rpcResult.order_id;
  const orderNumber = rpcResult.order_number;

  const paymentUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-payment`;
  const paymentRes = await fetch(paymentUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ order_id: orderId }),
  });

  if (!paymentRes.ok) {
    const errBody = await paymentRes.json().catch(() => ({}));
    return {
      success: false,
      order_id: orderId,
      order_number: orderNumber,
      error: errBody.error || 'payment_failed',
    };
  }

  const paymentData = await paymentRes.json();

  if (!paymentData.checkoutUrl) {
    return {
      success: false,
      order_id: orderId,
      order_number: orderNumber,
      error: 'no_checkout_url',
    };
  }

  clearHoldStorage();

  return {
    success: true,
    order_id: orderId,
    order_number: orderNumber,
    checkoutUrl: paymentData.checkoutUrl,
  };
}

export async function fetchServiceFeeForSections(sectionIds: string[], eventId: string): Promise<{
  feePerTicket: number;
  feeMode: string;
}> {
  const { data: ttSections } = await supabase
    .from('ticket_type_sections')
    .select('ticket_type_id')
    .in('section_id', sectionIds);

  if (!ttSections || ttSections.length === 0) {
    return { feePerTicket: 0, feeMode: 'none' };
  }

  const ticketTypeIds = [...new Set(ttSections.map(r => r.ticket_type_id))];

  const { data: ticketTypes } = await supabase
    .from('ticket_types')
    .select('service_fee_mode, service_fee_fixed, service_fee_percent, price')
    .in('id', ticketTypeIds)
    .eq('event_id', eventId)
    .limit(1);

  if (!ticketTypes || ticketTypes.length === 0) {
    return { feePerTicket: 0, feeMode: 'none' };
  }

  const tt = ticketTypes[0] as any;
  const mode = tt.service_fee_mode || 'none';

  if (mode === 'fixed') {
    return { feePerTicket: Number(tt.service_fee_fixed) || 0, feeMode: 'fixed' };
  }
  if (mode === 'percent') {
    const pct = Number(tt.service_fee_percent) || 0;
    const price = Number(tt.price) || 0;
    return { feePerTicket: Math.round(price * pct / 100) / 100, feeMode: 'percent' };
  }

  return { feePerTicket: 0, feeMode: 'none' };
}

export async function fetchOrderById(orderId: string) {
  const sessionId = getSessionId();
  const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=*&limit=1`;
  const res = await fetch(url, {
    headers: {
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'x-session-id': sessionId,
      'Accept': 'application/json',
    },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows.length > 0 ? rows[0] : null;
}

export async function fetchOrderSeats(orderId: string) {
  const { data, error } = await supabase
    .from('ticket_seats')
    .select('id, seat_id, event_id, price_paid, assigned_at, ticket_code, qr_data')
    .eq('order_id', orderId);

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
