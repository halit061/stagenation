const MAX_RETRIES = 4;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 10000;

interface CheckoutPayload {
  event_id: string;
  cart: { ticket_type_id: string; quantity: number; price: number }[];
  customer_email: string;
  customer_name: string;
  customer_phone: string;
  billing_street: string;
  billing_number: string;
  billing_postal_code: string;
  billing_city: string;
  billing_country: string;
  promo_code: string;
  marketing_opt_in: boolean;
  terms_accepted: boolean;
  terms_language: string;
  idempotency_key: string;
  order_id?: string;
  refund_protection?: boolean;
}

interface CheckoutResult {
  checkoutUrl: string;
  orderId: string;
  orderNumber: string;
}

interface ReserveResult {
  order_id: string;
  order_number: string;
  total_amount: number;
  has_payment?: boolean;
  status?: string;
}

export interface ReservationResult {
  order_id: string;
  order_number: string;
  expires_at: string;
  remaining_seconds: number;
  already_exists: boolean;
}

function generateIdempotencyKey(email: string, eventId: string, cart: CheckoutPayload['cart']): string {
  const cartSig = cart.map(i => `${i.ticket_type_id}:${i.quantity}`).sort().join('|');
  // Use localStorage to persist across page reloads/navigation (sessionStorage can be lost)
  const storageKey = `checkout_idem:${email}:${eventId}:${cartSig}`;
  const stored = localStorage.getItem(storageKey);

  // Reuse existing key if it was generated within the last 10 minutes
  if (stored) {
    try {
      const { key, ts } = JSON.parse(stored);
      if (Date.now() - ts < 10 * 60 * 1000) {
        return key;
      }
    } catch { /* ignore parse errors */ }
  }

  const sessionId = crypto.randomUUID();
  const key = `${email}:${eventId}:${cartSig}:${sessionId}`;
  localStorage.setItem(storageKey, JSON.stringify({ key, ts: Date.now() }));
  return key;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number,
  nonRetryStatuses: number[] = [400, 404, 409],
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.ok) return response;

      if (nonRetryStatuses.includes(response.status)) return response;

      if (response.status === 429 || response.status === 503) {
        const body = await response.json().catch(() => ({}));
        const serverRetry = body.retry_after_seconds;
        const delayMs = serverRetry
          ? serverRetry * 1000
          : Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, delayMs + Math.random() * 500));
          continue;
        }
        return response;
      }

      if (response.status >= 500 && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS) + Math.random() * 500));
        continue;
      }

      return response;
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS) + Math.random() * 500));
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}

function getHeaders() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return {
    url: supabaseUrl as string,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${anonKey}`,
    },
  };
}

export async function reserveTickets(payload: {
  event_id: string;
  cart: { ticket_type_id: string; quantity: number; price: number }[];
}): Promise<ReservationResult> {
  const { url, headers } = getHeaders();

  const response = await fetchWithRetry(
    `${url}/functions/v1/reserve-tickets`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        event_id: payload.event_id,
        cart: payload.cart,
        customer_email: '',
        customer_name: '',
        _t: Date.now(), // timing check for bot detection
      }),
    },
    MAX_RETRIES,
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    if (errorData.error === 'SOLD_OUT') throw new Error('SOLD_OUT');
    if (errorData.error === 'PHASE_LOCKED') throw new Error('PHASE_LOCKED');
    if (errorData.error === 'QUEUED') throw new Error('QUEUED');
    if (errorData.error === 'RATE_LIMITED') throw new Error('RATE_LIMITED');
    throw new Error(errorData.error || 'Reservation failed');
  }

  return response.json();
}

export async function checkoutWithRetry(payload: Omit<CheckoutPayload, 'idempotency_key'>): Promise<CheckoutResult> {
  const idempotencyKey = generateIdempotencyKey(payload.customer_email, payload.event_id, payload.cart);
  const fullPayload: CheckoutPayload = { ...payload, idempotency_key: idempotencyKey };

  const { url, headers } = getHeaders();

  const reserveResponse = await fetchWithRetry(
    `${url}/functions/v1/create-ticket-checkout`,
    { method: 'POST', headers, body: JSON.stringify(fullPayload) },
    MAX_RETRIES,
  );

  if (!reserveResponse.ok) {
    const errorData = await reserveResponse.json().catch(() => ({ error: 'Unknown error' }));
    const errMsg = errorData.error || errorData.message || 'Checkout failed';
    throw new Error(errMsg);
  }

  const reserveData: ReserveResult = await reserveResponse.json();

  if (reserveData.has_payment && reserveData.status === 'paid') {
    throw new Error('ALREADY_PAID');
  }

  const paymentResponse = await fetchWithRetry(
    `${url}/functions/v1/create-payment`,
    { method: 'POST', headers, body: JSON.stringify({ order_id: reserveData.order_id }) },
    MAX_RETRIES,
    [400, 404, 409],
  );

  if (!paymentResponse.ok) {
    const errorData = await paymentResponse.json().catch(() => ({ error: 'Unknown error' }));
    if (errorData.error === 'ALREADY_PAID') {
      throw new Error('ALREADY_PAID');
    }
    throw new Error(errorData.error || errorData.message || 'Payment creation failed');
  }

  const paymentData = await paymentResponse.json();

  // Clean up idempotency key from localStorage after successful payment creation
  const cartSig = payload.cart.map(i => `${i.ticket_type_id}:${i.quantity}`).sort().join('|');
  localStorage.removeItem(`checkout_idem:${payload.customer_email}:${payload.event_id}:${cartSig}`);

  return {
    checkoutUrl: paymentData.checkoutUrl,
    orderId: paymentData.orderId,
    orderNumber: paymentData.orderNumber,
  };
}
