import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders } from "../_shared/cors.ts";

const VERSION = '1.0.1';

async function mollieWithRetry(
  url: string,
  options: RequestInit,
  maxRetries429 = 2,
  maxRetries5xx = 1,
): Promise<Response> {
  let attempt = 0;
  const maxTotal = maxRetries429 + maxRetries5xx;
  let retries429 = 0;
  let retries5xx = 0;

  while (attempt <= maxTotal) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);

      if (res.status === 429 && retries429 < maxRetries429) {
        retries429++;
        attempt++;
        const retryAfterHeader = res.headers.get('Retry-After');
        const retryAfterMs = retryAfterHeader
          ? parseInt(retryAfterHeader, 10) * 1000
          : Math.min(300 * Math.pow(2, retries429 - 1), 3000);
        const jitter = Math.random() * 150;
        await new Promise(r => setTimeout(r, retryAfterMs + jitter));
        continue;
      }

      if (res.status >= 500 && res.status < 600 && retries5xx < maxRetries5xx) {
        retries5xx++;
        attempt++;
        const waitMs = Math.min(300 * Math.pow(2, retries5xx - 1), 2000) + Math.random() * 150;
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      return res;
    } catch (err) {
      clearTimeout(timeout);
      if (attempt < maxTotal) {
        attempt++;
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      throw err;
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return res;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  function jsonResponse(body: Record<string, unknown>, status: number, extraHeaders?: Record<string, string>) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Bizim-Version': VERSION, ...extraHeaders },
    });
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: { ...corsHeaders, 'X-Bizim-Version': VERSION } });
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    return jsonResponse({ status: 'ok', version: VERSION, method: 'POST required' }, 200);
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed. Use POST.' }, 405);
  }

  const startMs = Date.now();
  let outcome = 'unknown';

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const mollieApiKey = Deno.env.get('MOLLIE_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      outcome = 'config_error';
      console.error('[create-payment] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return jsonResponse({ error: 'Server configuration error' }, 500);
    }

    if (!mollieApiKey) {
      outcome = 'config_error';
      console.error('[create-payment] Missing MOLLIE_API_KEY');
      return jsonResponse({ error: 'Payment provider not configured' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let body: any;
    try {
      body = await req.json();
    } catch (_e) {
      outcome = 'invalid_json';
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const { order_id } = body;

    if (!order_id) {
      outcome = 'validation_error';
      return jsonResponse({ error: 'Missing order_id' }, 400);
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, event_id, total_amount, payer_email, payer_name, payment_id, status')
      .eq('id', order_id)
      .maybeSingle();

    if (orderError || !order) {
      outcome = 'order_not_found';
      return jsonResponse({ error: 'Order not found' }, 404);
    }

    if (order.status === 'paid') {
      outcome = 'already_paid';
      return jsonResponse({ error: 'ALREADY_PAID', message: 'Order is already paid' }, 409);
    }

    if (order.status !== 'pending') {
      outcome = 'invalid_status';
      return jsonResponse({ error: 'INVALID_ORDER_STATUS', message: `Order status is ${order.status}` }, 409);
    }

    if (order.payment_id) {
      const mollieCheckUrl = `https://api.mollie.com/v2/payments/${order.payment_id}`;
      try {
        const checkRes = await fetch(mollieCheckUrl, {
          headers: { 'Authorization': `Bearer ${mollieApiKey}` },
        });
        if (checkRes.ok) {
          const paymentData = await checkRes.json();
          if (paymentData._links?.checkout?.href && ['open', 'pending'].includes(paymentData.status)) {
            outcome = 'existing_payment_reused';
            return jsonResponse({
              checkoutUrl: paymentData._links.checkout.href,
              orderId: order.id,
              orderNumber: order.order_number,
            }, 200);
          }
        }
      } catch (_e) {
        // fall through to create new payment
      }
    }

    const amountInEuros = (order.total_amount / 100).toFixed(2);

    // SECURITY: Whitelist allowed redirect origins to prevent open redirect attacks
    const ALLOWED_ORIGINS = [
      'https://bizimevents.be',
      'https://www.bizimevents.be',
      Deno.env.get('BASE_URL'),
    ].filter(Boolean) as string[];

    const requestOrigin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/[^/]*$/, '') || '';
    const sanitizedOrigin = requestOrigin.replace(/\/$/, '');

    // SECURITY: Only allow redirects to strictly whitelisted origins (no prefix matching to prevent bypass)
    let BASE_URL: string;
    if (ALLOWED_ORIGINS.some(allowed => sanitizedOrigin === allowed)) {
      BASE_URL = sanitizedOrigin;
    } else {
      BASE_URL = Deno.env.get('BASE_URL') || 'https://bizimevents.be';
      console.warn(`[create-payment] Blocked redirect to untrusted origin: ${sanitizedOrigin}`);
    }

    const redirectUrl = `${BASE_URL}/payment-success?order_id=${order.id}`;
    const cancelUrl = `${BASE_URL}/tickets?payment=canceled&order_id=${order.id}`;
    const webhookUrl = `${supabaseUrl}/functions/v1/mollie-webhook`;

    const mollieIdempotencyKey = `order:${order.id}`;

    const molliePayment = await mollieWithRetry('https://api.mollie.com/v2/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mollieApiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': mollieIdempotencyKey,
      },
      body: JSON.stringify({
        amount: { currency: 'EUR', value: amountInEuros },
        description: 'BizimEvents Tickets',
        redirectUrl,
        cancelUrl,
        webhookUrl,
        metadata: {
          orderId: order.id,
          orderNumber: order.order_number,
          email: order.payer_email,
          event_id: order.event_id,
          type: 'tickets',
          brand: 'bizimevents',
        },
        method: null,
      }),
    });

    if (!molliePayment.ok) {
      const errBody = await molliePayment.text();
      console.error('Mollie payment creation failed:', molliePayment.status, errBody);
      outcome = 'mollie_error';
      return jsonResponse({ error: 'PAYMENT_FAILED', message: 'Failed to create payment. Please retry.' }, 502);
    }

    const payment = await molliePayment.json();

    await supabase.from('orders').update({
      payment_id: payment.id,
    }).eq('id', order.id);

    outcome = 'success';
    return jsonResponse({
      checkoutUrl: payment._links.checkout.href,
      orderId: order.id,
      orderNumber: order.order_number,
    }, 200);
  } catch (error) {
    outcome = 'exception';
    console.error('Create payment error:', error);
    return jsonResponse({ error: error.message || 'An error occurred' }, 500);
  }
});
