import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders } from "../_shared/cors.ts";

const MAX_ACTIVE_CHECKOUTS = parseInt(Deno.env.get('MAX_ACTIVE_CHECKOUTS') || '200', 10);
const HOLD_MINUTES = parseInt(Deno.env.get('HOLD_MINUTES') || '10', 10);
const RATE_IP_LIMIT = parseInt(Deno.env.get('RATE_IP_LIMIT') || '5', 10);
const RATE_WINDOW_SECONDS = parseInt(Deno.env.get('RATE_WINDOW_SECONDS') || '30', 10);

const MAX_BODY_SIZE = 10 * 1024; // 10KB max request body
const MAX_TICKETS_PER_EMAIL = parseInt(Deno.env.get('MAX_TICKETS_PER_EMAIL') || '20', 10);

function getClientIp(req: Request): string {
  // Priority: Cloudflare > Netlify/trusted proxy > forwarded (last resort)
  // cf-connecting-ip and x-nf-client-connection-ip are set by CDN, cannot be spoofed
  return req.headers.get('cf-connecting-ip')
    || req.headers.get('x-nf-client-connection-ip')
    || req.headers.get('x-real-ip')
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Request size limit
  const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_BODY_SIZE) {
    return new Response(
      JSON.stringify({ error: 'Request too large' }),
      { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let body: any;
    try {
      const rawBody = await req.text();
      if (rawBody.length > MAX_BODY_SIZE) {
        return new Response(
          JSON.stringify({ error: 'Request too large' }),
          { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      body = JSON.parse(rawBody);
    } catch (_e) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Bot detection: honeypot field (hidden field, bots fill it)
    if (body._hp || body.website || body.url) {
      console.error(`[SECURITY] Bot detected via honeypot, IP=${getClientIp(req)}`);
      // Return fake success to confuse bots
      return new Response(
        JSON.stringify({ order_id: crypto.randomUUID(), expires_at: new Date(Date.now() + 600000).toISOString(), already_exists: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Bot detection: timing check (requests faster than 2 seconds are suspicious)
    const clientTimestamp = parseInt(body._t || '0', 10);
    if (clientTimestamp > 0 && Date.now() - clientTimestamp < 2000) {
      console.error(`[SECURITY] Bot speed detected: ${Date.now() - clientTimestamp}ms, IP=${getClientIp(req)}`);
      return new Response(
        JSON.stringify({ error: 'RATE_LIMITED', message: 'Please wait before trying again.', retry_after_seconds: 5 }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const {
      event_id,
      cart,
      customer_email,
      customer_name,
      customer_phone = '',
      idempotency_key,
    } = body;

    if (!event_id || !cart || cart.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Allow empty email/name at reservation time (filled during checkout form)
    const finalEmail = customer_email || 'pending@checkout';
    const finalName = customer_name || 'Checkout in progress';

    // 1. Rate limiting by IP
    const clientIp = getClientIp(req);
    const rateLimitKey = `ip:${clientIp}:reserve`;

    const { data: rateResult, error: rateError } = await supabase.rpc('check_rate_limit', {
      p_key: rateLimitKey,
      p_max_attempts: RATE_IP_LIMIT,
      p_window_seconds: RATE_WINDOW_SECONDS,
    });

    if (rateError) {
      console.error('Rate limit check failed:', rateError);
    } else if (rateResult && !rateResult.allowed) {
      return new Response(
        JSON.stringify({
          error: 'RATE_LIMITED',
          message: 'Too many attempts. Please wait before trying again.',
          retry_after_seconds: rateResult.retry_after_seconds,
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': String(rateResult.retry_after_seconds) } }
      );
    }

    // 2. Per-email purchase limit check
    if (finalEmail && finalEmail !== 'pending@checkout') {
      const { count: existingTickets } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event_id)
        .eq('payer_email', finalEmail)
        .in('status', ['paid', 'reserved', 'pending']);

      const requestedQty = cart.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0);
      if ((existingTickets || 0) + requestedQty > MAX_TICKETS_PER_EMAIL) {
        return new Response(
          JSON.stringify({ error: 'PURCHASE_LIMIT', message: `Maximum ${MAX_TICKETS_PER_EMAIL} tickets per email per event.` }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 3. Release expired reservations first (cleanup)
    await supabase.rpc('release_expired_reservations', { p_event_id: event_id });

    // 3. Soft queue gate: count active holds for this event
    const { count: activePending } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event_id)
      .eq('status', 'reserved')
      .gt('expires_at', new Date().toISOString());

    if ((activePending || 0) >= MAX_ACTIVE_CHECKOUTS) {
      const jitter = Math.floor(Math.random() * 5) + 5;
      return new Response(
        JSON.stringify({
          error: 'QUEUED',
          message: 'You are in queue. Please wait...',
          retry_after_seconds: jitter,
          queue_position: (activePending || 0) - MAX_ACTIVE_CHECKOUTS + 1,
        }),
        { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Build idempotency key if not provided
    const finalIdempotencyKey = idempotency_key || `reserve:${finalEmail}:${event_id}:${JSON.stringify(cart)}`;

    // 5. Atomic reservation via RPC
    const items = cart.map((item: any) => ({
      ticket_type_id: item.ticket_type_id,
      quantity: item.quantity,
      price: item.price,
    }));

    const { data: reserveResult, error: reserveError } = await supabase.rpc('reserve_tickets', {
      p_event_id: event_id,
      p_items: items,
      p_customer_email: finalEmail,
      p_customer_name: finalName,
      p_customer_phone: customer_phone,
      p_hold_minutes: HOLD_MINUTES,
      p_idempotency_key: finalIdempotencyKey,
      p_metadata: { type: 'ticket_purchase', cart: items },
    });

    if (reserveError) {
      console.error('Reserve tickets RPC error:', reserveError);
      const msg = reserveError.message || '';
      if (msg.includes('Not enough tickets available')) {
        return new Response(
          JSON.stringify({ error: 'SOLD_OUT', message: msg }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (msg.includes('PHASE_LOCKED')) {
        return new Response(
          JSON.stringify({ error: 'PHASE_LOCKED', message: 'This ticket phase is not yet available' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ error: 'RESERVATION_FAILED', message: msg }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const expiresAtMs = new Date(reserveResult.expires_at).getTime();
    const remainingSeconds = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));

    return new Response(
      JSON.stringify({
        order_id: reserveResult.order_id,
        order_number: reserveResult.order_number,
        expires_at: reserveResult.expires_at,
        remaining_seconds: remainingSeconds,
        already_exists: reserveResult.already_exists,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Reserve tickets error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'An error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
