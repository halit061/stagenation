import { createClient } from 'npm:@supabase/supabase-js@2';
import { createHmac } from 'node:crypto';
import { getCorsHeaders } from "../_shared/cors.ts";

const VERSION = '3.0.0-reservation';

interface CartItem {
  ticket_type_id: string;
  quantity: number;
  price: number;
}

const RATE_LIMIT_MAX = parseInt(Deno.env.get('CHECKOUT_RATE_LIMIT_MAX') || '10', 10);
const RATE_LIMIT_WINDOW = parseInt(Deno.env.get('CHECKOUT_RATE_LIMIT_WINDOW') || '60', 10);
const MAX_CONCURRENT_PENDING = parseInt(Deno.env.get('MAX_CONCURRENT_PENDING') || '500', 10);

const MAX_BODY_SIZE = 10 * 1024; // 10KB max request body
const MAX_TICKETS_PER_EMAIL = parseInt(Deno.env.get('MAX_TICKETS_PER_EMAIL') || '20', 10);

function getClientIp(req: Request): string {
  // Priority: Cloudflare > Netlify/trusted proxy > forwarded (last resort)
  return req.headers.get('cf-connecting-ip')
    || req.headers.get('x-nf-client-connection-ip')
    || req.headers.get('x-real-ip')
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  function jsonResponse(body: Record<string, unknown>, status: number, extraHeaders?: Record<string, string>) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-StageNation-Version': VERSION, ...extraHeaders },
    });
  }
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: { ...corsHeaders, 'X-StageNation-Version': VERSION } });
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    return jsonResponse({ status: 'ok', version: VERSION, method: 'POST required' }, 200);
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed. Use POST.' }, 405);
  }

  // Request size limit
  const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_BODY_SIZE) {
    return jsonResponse({ error: 'Request too large' }, 413);
  }

  const startMs = Date.now();
  let outcome = 'unknown';

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let body: any;
    try {
      const rawBody = await req.text();
      if (rawBody.length > MAX_BODY_SIZE) {
        outcome = 'body_too_large';
        return jsonResponse({ error: 'Request too large' }, 413);
      }
      body = JSON.parse(rawBody);
    } catch (_e) {
      outcome = 'invalid_json';
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    // Bot detection: honeypot field
    if (body._hp || body.website || body.url) {
      console.error(`[SECURITY] Bot detected via honeypot, IP=${getClientIp(req)}`);
      return jsonResponse({ error: 'Something went wrong', message: 'Please try again' }, 400);
    }

    // SECURITY: Sanitize and validate all user inputs
    function sanitizeString(val: unknown, maxLen = 500): string {
      if (typeof val !== 'string') return '';
      return val.trim().substring(0, maxLen).replace(/<[^>]*>/g, '');
    }

    function isValidEmail(email: string): boolean {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
    }

    function isValidUUID(id: string): boolean {
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    }

    const event_id = sanitizeString(body.event_id, 36);
    const customer_email = sanitizeString(body.customer_email, 254).toLowerCase();
    const customer_name = sanitizeString(body.customer_name, 200);
    const customer_phone = sanitizeString(body.customer_phone || '', 30);
    const billing_street = sanitizeString(body.billing_street, 200);
    const billing_number = sanitizeString(body.billing_number, 20);
    const billing_postal_code = sanitizeString(body.billing_postal_code, 20);
    const billing_city = sanitizeString(body.billing_city, 100);
    const billing_country = sanitizeString(body.billing_country, 60);
    const promo_code = sanitizeString(body.promo_code || '', 50).toUpperCase();
    const marketing_opt_in = body.marketing_opt_in === true;
    const terms_accepted = body.terms_accepted === true;
    const terms_language = ['nl', 'en', 'tr', 'fr', 'de'].includes(body.terms_language) ? body.terms_language : 'nl';
    const clientIdempotencyKey = sanitizeString(body.idempotency_key || '', 500);
    const cart = Array.isArray(body.cart) ? body.cart : [];
    const reservedOrderId = sanitizeString(body.order_id || '', 36);
    const refund_protection = body.refund_protection === true;

    // Determine if this is a reservation-based checkout
    const isReservationFlow = reservedOrderId && isValidUUID(reservedOrderId);

    if (!cart.length || !customer_email || !customer_name || !event_id) {
      outcome = 'validation_error';
      return jsonResponse({ error: 'Missing required fields' }, 400);
    }

    // SECURITY: Validate email format
    if (!isValidEmail(customer_email)) {
      outcome = 'validation_error';
      return jsonResponse({ error: 'Invalid email format' }, 400);
    }

    // SECURITY: Validate event_id is a UUID
    if (!isValidUUID(event_id)) {
      outcome = 'validation_error';
      return jsonResponse({ error: 'Invalid event ID' }, 400);
    }

    // SECURITY: Per-email purchase limit
    if (!isReservationFlow) {
      const { count: existingOrders } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event_id)
        .eq('payer_email', customer_email)
        .in('status', ['paid', 'reserved', 'pending']);

      const requestedQty = cart.reduce((sum: number, item: CartItem) => sum + (item.quantity || 0), 0);
      if ((existingOrders || 0) + requestedQty > MAX_TICKETS_PER_EMAIL) {
        outcome = 'purchase_limit';
        console.warn(`[SECURITY] Purchase limit exceeded: ${customer_email}, existing=${existingOrders}, requested=${requestedQty}, IP=${getClientIp(req)}`);
        return jsonResponse({ error: 'PURCHASE_LIMIT', message: `Maximum ${MAX_TICKETS_PER_EMAIL} tickets per email per event.` }, 409);
      }
    }

    // SECURITY: Validate cart structure
    if (cart.length > 10) {
      outcome = 'validation_error';
      return jsonResponse({ error: 'Too many items in cart' }, 400);
    }

    for (const item of cart) {
      if (!item.ticket_type_id || !isValidUUID(item.ticket_type_id)) {
        outcome = 'validation_error';
        return jsonResponse({ error: 'Invalid ticket type ID in cart' }, 400);
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) {
        outcome = 'validation_error';
        return jsonResponse({ error: 'Invalid quantity in cart' }, 400);
      }
    }

    // --- SHARED: Fetch event and ticket types ---

    const { data: event } = await supabase.from('events').select('name, service_fee_enabled, service_fee_amount').eq('id', event_id).single();
    if (!event) {
      outcome = 'event_not_found';
      return jsonResponse({ error: 'Event not found' }, 404);
    }

    const ticketTypeIds = cart.map((item: CartItem) => item.ticket_type_id);
    const { data: ticketTypes } = await supabase
      .from('ticket_types')
      .select('id, name, price, is_active, event_id, service_fee_mode, service_fee_fixed, service_fee_percent')
      .in('id', ticketTypeIds);

    // SECURITY: Validate all ticket types
    for (const item of cart) {
      const dbTicketType = ticketTypes?.find((tt: any) => tt.id === item.ticket_type_id);
      if (!dbTicketType) {
        outcome = 'invalid_ticket_type';
        return jsonResponse({ error: 'Invalid ticket type', message: `Ticket type ${item.ticket_type_id} not found` }, 400);
      }
      if (!dbTicketType.is_active) {
        outcome = 'inactive_ticket_type';
        return jsonResponse({ error: 'Ticket type not available', message: `${dbTicketType.name} is not currently available` }, 400);
      }
      if (dbTicketType.event_id !== event_id) {
        outcome = 'ticket_type_event_mismatch';
        return jsonResponse({ error: 'Ticket type does not belong to this event' }, 400);
      }
      if (dbTicketType.price !== item.price) {
        outcome = 'price_tampered';
        console.error(`[SECURITY] Price tamper attempt for ${dbTicketType.name}: client=${item.price}, server=${dbTicketType.price}, IP=${getClientIp(req)}`);
        return jsonResponse({ error: 'PRICE_MISMATCH', message: 'Ticket price has changed. Please refresh and try again.' }, 409);
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) {
        outcome = 'invalid_quantity';
        return jsonResponse({ error: 'Invalid quantity', message: 'Quantity must be between 1 and 20' }, 400);
      }
    }

    const hasVipTicket = ticketTypes?.some((tt: any) =>
      tt.name.toUpperCase().includes('VIP')
    ) || false;
    const productType = hasVipTicket ? 'VIP' : 'REGULAR';

    // --- SHARED: Calculate fees ---

    const subtotalCents = cart.reduce((sum: number, item: CartItem) => {
      const dbPrice = ticketTypes?.find((tt: any) => tt.id === item.ticket_type_id)?.price ?? 0;
      return sum + (dbPrice * item.quantity);
    }, 0);
    let totalQuantity = 0;
    let serviceFeeTotalCents = 0;

    for (const item of cart) {
      totalQuantity += item.quantity;
      const tt = ticketTypes?.find((t: any) => t.id === item.ticket_type_id);
      if (tt) {
        const mode = tt.service_fee_mode || 'none';
        if (mode === 'fixed') {
          serviceFeeTotalCents += Math.round(Number(tt.service_fee_fixed) * 100) * item.quantity;
        } else if (mode === 'percent') {
          serviceFeeTotalCents += Math.round(tt.price * item.quantity * Number(tt.service_fee_percent) / 100);
        }
      }
    }

    const eventFeeCents = (event as any).service_fee_enabled ? totalQuantity * ((event as any).service_fee_amount || 0) : 0;
    serviceFeeTotalCents += eventFeeCents;

    // --- SHARED: Promo code validation ---

    let promoDiscountCents = 0;
    let validatedPromoId: string | null = null;

    if (promo_code) {
      const { data: promo } = await supabase
        .from('promo_codes')
        .select('id, code, discount_type, discount_value, max_uses, used_count, valid_from, valid_until, is_active, event_id, ticket_type_id')
        .eq('code', promo_code)
        .eq('is_active', true)
        .maybeSingle();

      if (!promo) {
        console.warn(`[checkout] Invalid promo code: ${promo_code}`);
      } else {
        const now = new Date();
        let promoValid = true;

        if (promo.event_id && promo.event_id !== event_id) {
          console.warn(`[checkout] Promo code ${promo_code} is for different event`);
          promoValid = false;
        }
        if (promo.max_uses !== null && promo.used_count >= promo.max_uses) {
          console.warn(`[checkout] Promo code ${promo_code} exceeded max uses: ${promo.used_count}/${promo.max_uses}`);
          promoValid = false;
        }
        if (promo.valid_from && new Date(promo.valid_from) > now) {
          console.warn(`[checkout] Promo code ${promo_code} not yet valid`);
          promoValid = false;
        }
        if (promo.valid_until && new Date(promo.valid_until) < now) {
          console.warn(`[checkout] Promo code ${promo_code} expired`);
          promoValid = false;
        }
        if (promo.ticket_type_id) {
          const cartHasTicketType = cart.some((item: CartItem) => item.ticket_type_id === promo.ticket_type_id);
          if (!cartHasTicketType) {
            console.warn(`[checkout] Promo code ${promo_code} not valid for ticket types in cart`);
            promoValid = false;
          }
        }

        if (promoValid) {
          if (promo.discount_type === 'percentage') {
            promoDiscountCents = Math.round(subtotalCents * promo.discount_value / 100);
          } else {
            promoDiscountCents = Math.min(promo.discount_value, subtotalCents);
          }
          validatedPromoId = promo.id;
        }
      }
    }

    // --- SHARED: Refund protection fee (server-side calculation) ---

    let refundProtectionFeeCents = 0;
    if (refund_protection) {
      const { data: rpConfig } = await supabase
        .from('refund_protection_config')
        .select('is_enabled, fee_type, fee_value')
        .eq('event_id', event_id)
        .eq('is_enabled', true)
        .maybeSingle();

      if (rpConfig) {
        if (rpConfig.fee_type === 'percentage') {
          refundProtectionFeeCents = Math.round(subtotalCents * Number(rpConfig.fee_value) / 100);
        } else {
          refundProtectionFeeCents = Math.round(Number(rpConfig.fee_value) * 100);
        }
      } else {
        console.warn(`[checkout] Refund protection requested but no config for event ${event_id}`);
      }
    }

    const platformFeeTotalCents = 0;
    const grandTotalCents = Math.max(0, subtotalCents + serviceFeeTotalCents - promoDiscountCents + refundProtectionFeeCents);
    const netRevenueCents = Math.max(0, subtotalCents - promoDiscountCents);

    const items = cart.map((item: CartItem) => ({
      ticket_type_id: item.ticket_type_id,
      quantity: item.quantity,
      price: item.price,
    }));

    // ============================================================
    // RESERVATION-BASED FLOW: order_id provided from reserve-tickets
    // ============================================================
    if (isReservationFlow) {
      // Fetch the reserved order
      const { data: reservedOrder, error: fetchError } = await supabase
        .from('orders')
        .select('id, event_id, status, expires_at, reserved_items, order_number')
        .eq('id', reservedOrderId)
        .single();

      if (fetchError || !reservedOrder) {
        outcome = 'reserved_order_not_found';
        return jsonResponse({ error: 'Reserved order not found' }, 404);
      }

      if (reservedOrder.event_id !== event_id) {
        outcome = 'event_mismatch';
        return jsonResponse({ error: 'Order does not belong to this event' }, 400);
      }

      if (reservedOrder.status !== 'reserved') {
        outcome = 'invalid_reservation_status';
        return jsonResponse({ error: 'Order is not in reserved status', status: reservedOrder.status }, 400);
      }

      if (reservedOrder.expires_at && new Date(reservedOrder.expires_at) < new Date()) {
        outcome = 'reservation_expired';
        return jsonResponse({ error: 'RESERVATION_EXPIRED', message: 'Your reservation has expired. Please try again.' }, 409);
      }

      // Convert reservation to sold (atomic: reserved -> sold)
      const { error: convertError } = await supabase.rpc('convert_reservation_to_sold', {
        p_order_id: reservedOrderId,
      });

      if (convertError) {
        const msg = convertError.message || '';
        if (msg.includes('expired')) {
          outcome = 'reservation_expired';
          return jsonResponse({ error: 'RESERVATION_EXPIRED', message: msg }, 409);
        }
        if (msg.includes('Not enough tickets')) {
          outcome = 'sold_out';
          return jsonResponse({ error: 'SOLD_OUT', message: 'Tükendi! Biletler satın alma işlemi sırasında tükendi.' }, 409);
        }
        outcome = 'convert_error';
        return jsonResponse({ error: 'Failed to process reservation', message: msg }, 500);
      }

      // Update the order with full details (billing, fees, promo, refund protection)
      const { error: updateError } = await supabase.from('orders').update({
        payer_email: customer_email,
        payer_name: customer_name,
        payer_phone: customer_phone,
        total_amount: grandTotalCents,
        payment_provider: 'mollie',
        promo_code: promo_code || null,
        product_type: productType,
        service_fee_total_cents: serviceFeeTotalCents,
        platform_fee_total_cents: platformFeeTotalCents,
        provider_fee_total_cents: 0,
        net_revenue_cents: netRevenueCents,
        billing_street: billing_street || null,
        billing_number: billing_number || null,
        billing_postal_code: billing_postal_code || null,
        billing_city: billing_city || null,
        billing_country: billing_country || null,
        idempotency_key: clientIdempotencyKey || null,
        refund_protection: refund_protection,
        refund_protection_fee_cents: refundProtectionFeeCents,
        metadata: {
          type: 'ticket_purchase',
          cart,
          subtotal_cents: subtotalCents,
          event_fee_cents: eventFeeCents,
          promo_discount_cents: promoDiscountCents,
          promo_id: validatedPromoId,
          refund_protection_fee_cents: refundProtectionFeeCents,
          reservation_flow: true,
        },
        updated_at: new Date().toISOString(),
      }).eq('id', reservedOrderId);

      if (updateError) {
        outcome = 'order_update_error';
        console.error('[checkout] Failed to update reserved order:', updateError);
        // Rollback: restore stock
        await supabase.rpc('rollback_ticket_stock', { p_event_id: event_id, p_items: items });
        return jsonResponse({ error: 'Failed to update order' }, 500);
      }

      // Create ticket records
      const termsVersion = '2024-12-15';
      const termsAcceptedAt = terms_accepted ? new Date().toISOString() : null;
      const ticketsToCreate = [];

      for (const item of cart) {
        const ticketType = ticketTypes?.find(tt => tt.id === item.ticket_type_id);
        const ticketProductType = ticketType?.name.toUpperCase().includes('VIP') ? 'VIP' : 'REGULAR';
        const prefix = (ticketType?.name || 'TKT').replace(/[^A-Za-z]/g, '').toUpperCase().substring(0, 3).padEnd(3, 'X');

        for (let i = 0; i < item.quantity; i++) {
          const randomPart = Array.from(crypto.getRandomValues(new Uint8Array(8)))
            .map(b => b.toString(36).padStart(2, '0'))
            .join('')
            .toUpperCase()
            .substring(0, 12);
          const ticketNumber = `${prefix}-${randomPart}`;
          const token = createHmac('sha256', supabaseServiceKey).update(`${reservedOrderId}-${ticketNumber}-${crypto.randomUUID()}`).digest('hex');
          ticketsToCreate.push({
            order_id: reservedOrderId, event_id, ticket_type_id: item.ticket_type_id, ticket_number: ticketNumber,
            token: token.substring(0, 32), status: 'pending', holder_email: customer_email, holder_name: customer_name, qr_data: token,
            product_type: ticketProductType,
            terms_accepted, terms_accepted_at: termsAcceptedAt, terms_version: termsVersion, terms_language
          });
        }
      }

      const { error: ticketsError } = await supabase.from('tickets').insert(ticketsToCreate);
      if (ticketsError) {
        outcome = 'ticket_error';
        await supabase.from('orders').update({ status: 'failed' }).eq('id', reservedOrderId);
        await supabase.rpc('rollback_ticket_stock', { p_event_id: event_id, p_items: items });
        return jsonResponse({ error: 'Failed to create tickets' }, 500);
      }

      // Increment promo code usage (atomic to prevent race conditions)
      if (validatedPromoId) {
        try {
          await supabase.rpc('increment_promo_usage', { p_promo_id: validatedPromoId });
        } catch (promoErr) {
          console.error(`[checkout] Failed to increment promo usage:`, promoErr);
        }
      }

      outcome = 'success_reservation';
      return jsonResponse({
        order_id: reservedOrderId,
        order_number: reservedOrder.order_number,
        total_amount: grandTotalCents,
      }, 200);
    }

    // ============================================================
    // DIRECT FLOW: No reservation, original behavior
    // ============================================================

    const clientIp = getClientIp(req);
    const rateLimitKey = `checkout:${clientIp}`;
    const { data: rateResult } = await supabase.rpc('check_rate_limit', {
      p_key: rateLimitKey,
      p_max_attempts: RATE_LIMIT_MAX,
      p_window_seconds: RATE_LIMIT_WINDOW,
    });

    if (rateResult && !rateResult.allowed) {
      outcome = 'rate_limited';
      return jsonResponse(
        { error: 'RATE_LIMITED', message: 'Too many checkout attempts. Please wait.', retry_after_seconds: rateResult.retry_after_seconds },
        429,
        { 'Retry-After': String(rateResult.retry_after_seconds) }
      );
    }

    const { count: activePending } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event_id)
      .eq('status', 'pending')
      .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());

    if ((activePending || 0) >= MAX_CONCURRENT_PENDING) {
      outcome = 'backpressure';
      const retryAfter = Math.floor(Math.random() * 3) + 3;
      return jsonResponse(
        { error: 'BUSY', message: 'Server is busy, please retry shortly.', retry_after_seconds: retryAfter },
        503,
        { 'Retry-After': String(retryAfter) }
      );
    }

    const idempotencyKey = clientIdempotencyKey || `checkout:${customer_email}:${event_id}:${crypto.randomUUID()}`;

    // Check 1: Exact idempotency key match
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('id, order_number, payment_id, status')
      .eq('idempotency_key', idempotencyKey)
      .in('status', ['pending', 'paid'])
      .maybeSingle();

    if (existingOrder) {
      outcome = 'idempotent_hit';
      return jsonResponse({
        order_id: existingOrder.id,
        order_number: existingOrder.order_number,
        has_payment: !!existingOrder.payment_id,
        status: existingOrder.status,
      }, 200);
    }

    // Check 2: Duplicate detection - same email + event within last 5 minutes
    // Catches cases where idempotency key differs (e.g. session lost on page reload)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentOrder } = await supabase
      .from('orders')
      .select('id, order_number, payment_id, status, total_amount')
      .eq('payer_email', customer_email)
      .eq('event_id', event_id)
      .in('status', ['pending', 'paid'])
      .gte('created_at', fiveMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentOrder) {
      outcome = 'duplicate_detected';
      return jsonResponse({
        order_id: recentOrder.id,
        order_number: recentOrder.order_number,
        has_payment: !!recentOrder.payment_id,
        status: recentOrder.status,
      }, 200);
    }

    const { data: stockResult, error: stockError } = await supabase.rpc('atomic_decrement_ticket_stock', {
      p_event_id: event_id,
      p_items: items,
    });

    if (stockError) {
      const msg = stockError.message || '';
      if (msg.includes('Not enough tickets')) {
        outcome = 'sold_out';
        return jsonResponse({ error: 'SOLD_OUT', message: msg }, 409);
      }
      if (msg.includes('PHASE_LOCKED')) {
        outcome = 'phase_locked';
        return jsonResponse({ error: 'PHASE_LOCKED', message: 'This ticket phase is not yet available' }, 409);
      }
      outcome = 'stock_error';
      return jsonResponse({ error: 'Stock check failed', message: msg }, 500);
    }

    const orderRandomPart = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map(b => b.toString(36).padStart(2, '0'))
      .join('')
      .toUpperCase()
      .substring(0, 12);
    const orderNumber = `ORD-${orderRandomPart}`;

    const { data: newOrder, error: orderError } = await supabase.from('orders').insert({
      event_id, order_number: orderNumber, payer_email: customer_email, payer_name: customer_name, payer_phone: customer_phone,
      total_amount: grandTotalCents, status: 'pending', payment_provider: 'mollie', promo_code: promo_code || null,
      product_type: productType,
      service_fee_total_cents: serviceFeeTotalCents,
      platform_fee_total_cents: platformFeeTotalCents,
      provider_fee_total_cents: 0,
      net_revenue_cents: netRevenueCents,
      billing_street: billing_street || null,
      billing_number: billing_number || null,
      billing_postal_code: billing_postal_code || null,
      billing_city: billing_city || null,
      billing_country: billing_country || null,
      idempotency_key: idempotencyKey,
      refund_protection: refund_protection,
      refund_protection_fee_cents: refundProtectionFeeCents,
      metadata: {
        type: 'ticket_purchase',
        cart,
        subtotal_cents: subtotalCents,
        event_fee_cents: eventFeeCents,
        promo_discount_cents: promoDiscountCents,
        promo_id: validatedPromoId,
        refund_protection_fee_cents: refundProtectionFeeCents,
      }
    }).select().single();

    if (orderError || !newOrder) {
      outcome = 'order_error';
      await supabase.rpc('rollback_ticket_stock', { p_event_id: event_id, p_items: items });
      return jsonResponse({ error: 'Failed to create order' }, 500);
    }

    const termsVersion = '2024-12-15';
    const termsAcceptedAt = terms_accepted ? new Date().toISOString() : null;

    const ticketsToCreate = [];
    for (const item of cart) {
      const ticketType = ticketTypes?.find(tt => tt.id === item.ticket_type_id);
      const ticketProductType = ticketType?.name.toUpperCase().includes('VIP') ? 'VIP' : 'REGULAR';
      const prefix = (ticketType?.name || 'TKT').replace(/[^A-Za-z]/g, '').toUpperCase().substring(0, 3).padEnd(3, 'X');

      for (let i = 0; i < item.quantity; i++) {
        const randomPart = Array.from(crypto.getRandomValues(new Uint8Array(8)))
          .map(b => b.toString(36).padStart(2, '0'))
          .join('')
          .toUpperCase()
          .substring(0, 12);
        const ticketNumber = `${prefix}-${randomPart}`;
        const token = createHmac('sha256', supabaseServiceKey).update(`${newOrder.id}-${ticketNumber}-${crypto.randomUUID()}`).digest('hex');
        ticketsToCreate.push({
          order_id: newOrder.id, event_id, ticket_type_id: item.ticket_type_id, ticket_number: ticketNumber,
          token: token.substring(0, 32), status: 'pending', holder_email: customer_email, holder_name: customer_name, qr_data: token,
          product_type: ticketProductType,
          terms_accepted, terms_accepted_at: termsAcceptedAt, terms_version: termsVersion, terms_language
        });
      }
    }

    const { error: ticketsError } = await supabase.from('tickets').insert(ticketsToCreate);
    if (ticketsError) {
      outcome = 'ticket_error';
      await supabase.from('orders').update({ status: 'failed' }).eq('id', newOrder.id);
      await supabase.rpc('rollback_ticket_stock', { p_event_id: event_id, p_items: items });
      return jsonResponse({ error: 'Failed to create tickets' }, 500);
    }

    // Increment promo code usage (atomic to prevent race conditions)
    if (validatedPromoId) {
      try {
        await supabase.rpc('increment_promo_usage', { p_promo_id: validatedPromoId });
      } catch (promoErr) {
        console.error(`[checkout] Failed to increment promo usage:`, promoErr);
      }
    }

    outcome = 'success';
    return jsonResponse({
      order_id: newOrder.id,
      order_number: orderNumber,
      total_amount: grandTotalCents,
    }, 200);
  } catch (error) {
    outcome = 'exception';
    console.error('Create ticket checkout error:', error);
    return jsonResponse({ error: error.message || 'An error occurred' }, 500);
  }
});
