import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders } from "../_shared/cors.ts";

interface CreateOrderRequest {
  table_ids: string[];
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  event_id: string;
  number_of_guests: number;
  special_requests?: string;
  marketing_opt_in?: boolean;
  terms_accepted?: boolean;
  terms_language?: string;
}

const MAX_BODY_SIZE = 10 * 1024; // 10KB
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = 60;
const MAX_TABLES_PER_ORDER = 10;

function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function sanitizeString(val: unknown, maxLen = 500): string {
  if (typeof val !== 'string') return '';
  return val.trim().substring(0, maxLen).replace(/<[^>]*>/g, '');
}

function getClientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip')
    || req.headers.get('x-nf-client-connection-ip')
    || req.headers.get('x-real-ip')
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const mollieApiKey = Deno.env.get('MOLLIE_API_KEY');

    if (!mollieApiKey) {
      console.error('MOLLIE_API_KEY is missing');
      return new Response(
        JSON.stringify({ error: 'Mollie API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SECURITY: Request size limit
    const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_BODY_SIZE) {
      return new Response(
        JSON.stringify({ error: 'Request too large' }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SECURITY: Rate limiting by IP
    const clientIp = getClientIp(req);
    const { data: rateResult } = await supabase.rpc('check_rate_limit', {
      p_key: `table_order:${clientIp}`,
      p_max_attempts: RATE_LIMIT_MAX,
      p_window_seconds: RATE_LIMIT_WINDOW,
    });

    if (rateResult && !rateResult.allowed) {
      return new Response(
        JSON.stringify({ error: 'RATE_LIMITED', message: 'Too many attempts. Please wait.', retry_after_seconds: rateResult.retry_after_seconds }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': String(rateResult.retry_after_seconds) } }
      );
    }

    let requestBody: CreateOrderRequest;
    try {
      const rawBody = await req.text();
      if (rawBody.length > MAX_BODY_SIZE) {
        return new Response(
          JSON.stringify({ error: 'Request too large' }),
          { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      requestBody = JSON.parse(rawBody);
    } catch (_e) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { table_ids, event_id, number_of_guests, marketing_opt_in = false, terms_accepted = false, terms_language = 'nl' } = requestBody;

    // SECURITY: Sanitize string inputs
    const customer_name = sanitizeString(requestBody.customer_name, 200);
    const customer_email = sanitizeString(requestBody.customer_email, 254).toLowerCase();
    const customer_phone = sanitizeString(requestBody.customer_phone, 30);
    const special_requests = sanitizeString(requestBody.special_requests || '', 1000);

    if (!table_ids || table_ids.length === 0 || !customer_email || !customer_name || !customer_phone || !event_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SECURITY: Validate email format
    if (!isValidEmail(customer_email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SECURITY: Validate event_id is a UUID
    if (!isValidUUID(event_id)) {
      return new Response(
        JSON.stringify({ error: 'Invalid event ID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SECURITY: Validate table_ids
    if (!Array.isArray(table_ids) || table_ids.length > MAX_TABLES_PER_ORDER) {
      return new Response(
        JSON.stringify({ error: `Maximum ${MAX_TABLES_PER_ORDER} tables per order` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    for (const tid of table_ids) {
      if (!isValidUUID(tid)) {
        return new Response(
          JSON.stringify({ error: 'Invalid table ID' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // SECURITY: Validate number_of_guests
    if (!Number.isInteger(number_of_guests) || number_of_guests < 1 || number_of_guests > 100) {
      return new Response(
        JSON.stringify({ error: 'Invalid number of guests (must be 1-100)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: tables } = await supabase
      .from('table_bookings')
      .select('id, floorplan_table_id, total_price, status, order_id, floorplan_tables(table_number, capacity, price)')
      .in('id', table_ids)
      .eq('event_id', event_id);

    if (!tables || tables.length !== table_ids.length) {
      return new Response(
        JSON.stringify({ error: 'Some tables not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const unavailableTables = tables.filter((t: any) => t.status === 'PAID' || (t.status === 'PENDING' && t.order_id !== null));
    if (unavailableTables.length > 0) {
      return new Response(
        JSON.stringify({ error: 'Some tables are already booked or being processed by another order' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const invalidStatusTables = tables.filter((t: any) => t.status !== 'PENDING');
    if (invalidStatusTables.length > 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid table status. Tables must be in PENDING status to proceed.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tableCapacity = tables[0]?.floorplan_tables?.capacity;
    if (tableCapacity && number_of_guests > tableCapacity) {
      return new Response(
        JSON.stringify({
          error: `Number of guests (${number_of_guests}) exceeds table capacity (${tableCapacity})`
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SECURITY: Calculate total from the authoritative floorplan_tables.price, NOT from client-supplied total_price
    const totalAmount = tables.reduce((sum: number, t: any) => {
      const serverPrice = parseFloat(t.floorplan_tables?.price);
      if (isNaN(serverPrice) || serverPrice <= 0) {
        throw new Error(`Invalid price for table ${t.floorplan_tables?.table_number}`);
      }
      return sum + serverPrice;
    }, 0);
    const randomPart = Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map(b => b.toString(36).padStart(2, '0'))
      .join('')
      .toUpperCase()
      .substring(0, 9);
    const orderNumber = `TBL-${Date.now()}-${randomPart}`;

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        event_id,
        order_number: orderNumber,
        payer_email: customer_email,
        payer_name: customer_name,
        payer_phone: customer_phone,
        total_amount: Math.round(totalAmount * 100),
        status: 'pending',
        payment_provider: 'mollie',
        product_type: 'TABLE',
        metadata: { type: 'table_booking', table_ids, number_of_guests, special_requests }
      })
      .select()
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: 'Failed to create order' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: updateResult, error: updateError } = await supabase
      .from('table_bookings')
      .update({
        order_id: order.id,
        status: 'PENDING',
        customer_name,
        customer_email,
        customer_phone,
        number_of_guests,
        special_requests,
        updated_at: new Date().toISOString()
      })
      .in('id', table_ids)
      .select();

    if (updateError) {
      console.error('❌ Failed to link table bookings to order:', updateError);
      await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
      return new Response(
        JSON.stringify({ error: 'Failed to link bookings to order: ' + updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const amountInEuros = totalAmount.toFixed(2);

    // SECURITY: Whitelist allowed redirect origins to prevent open redirect attacks
    const ALLOWED_ORIGINS = [
      'https://stagenation.be',
      'https://www.stagenation.be',
      Deno.env.get('BASE_URL'),
    ].filter(Boolean) as string[];

    const requestOrigin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/[^/]*$/, '') || '';
    const sanitizedOrigin = requestOrigin.replace(/\/$/, '');

    let BASE_URL: string;
    if (ALLOWED_ORIGINS.some(allowed => sanitizedOrigin === allowed)) {
      BASE_URL = sanitizedOrigin;
    } else {
      BASE_URL = Deno.env.get('BASE_URL') || 'https://stagenation.be';
      console.warn(`[create-table-order] Blocked redirect to untrusted origin: ${sanitizedOrigin}`);
    }

    const redirectUrl = `${BASE_URL}/payment-success?order_id=${order.id}`;
    const webhookUrl = `${supabaseUrl}/functions/v1/mollie-webhook`;

    const molliePayment = await fetch('https://api.mollie.com/v2/payments', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${mollieApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: { currency: 'EUR', value: amountInEuros },
        description: 'StageNation Reservering',
        redirectUrl,
        webhookUrl,
        metadata: { orderId: order.id, orderNumber, email: customer_email, table_ids: table_ids.join(','), event_id, type: 'tables', brand: 'stagenation' },
        method: null
      }),
    });

    if (!molliePayment.ok) {
      await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
      return new Response(
        JSON.stringify({ error: 'Failed to create payment' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payment = await molliePayment.json();
    await supabase.from('orders').update({ payment_id: payment.id }).eq('id', order.id);

    return new Response(
      JSON.stringify({ checkoutUrl: payment._links.checkout.href, orderId: order.id, orderNumber }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Create table order error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'An error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});