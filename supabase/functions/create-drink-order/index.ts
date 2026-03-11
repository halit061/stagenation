import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { getCorsHeaders } from "../_shared/cors.ts";

interface DrinkOrderItem {
  drink_id: string;
  quantity: number;
}

interface CreateDrinkOrderRequest {
  event_id: string;
  table_booking_id?: string;
  items: DrinkOrderItem[];
  fulfillment_type: "DELIVERY" | "PICKUP";
  pickup_bar?: "BAR_MAIN" | "BAR_PICKUP" | "BAR_LOUNGE";
  customer_email?: string;
  customer_name?: string;
}

const MAX_BODY_SIZE = 10 * 1024; // 10KB
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = 60;
const MAX_ITEMS_PER_ORDER = 20;
const MAX_QUANTITY_PER_ITEM = 50;

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
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const mollieApiKey = Deno.env.get("MOLLIE_API_KEY");

    if (!mollieApiKey) {
      throw new Error("MOLLIE_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // SECURITY: Request size limit
    const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_BODY_SIZE) {
      return new Response(
        JSON.stringify({ error: "Request too large" }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SECURITY: Rate limiting by IP
    const clientIp = getClientIp(req);
    const { data: rateResult } = await supabase.rpc('check_rate_limit', {
      p_key: `drink_order:${clientIp}`,
      p_max_attempts: RATE_LIMIT_MAX,
      p_window_seconds: RATE_LIMIT_WINDOW,
    });

    if (rateResult && !rateResult.allowed) {
      return new Response(
        JSON.stringify({ error: "RATE_LIMITED", message: "Too many orders. Please wait.", retry_after_seconds: rateResult.retry_after_seconds }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rateResult.retry_after_seconds) } }
      );
    }

    let body: CreateDrinkOrderRequest;
    try {
      const rawBody = await req.text();
      if (rawBody.length > MAX_BODY_SIZE) {
        return new Response(
          JSON.stringify({ error: "Request too large" }),
          { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      body = JSON.parse(rawBody);
    } catch (_e) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { event_id, table_booking_id, items, fulfillment_type, pickup_bar, customer_email, customer_name } = body;

    if (!event_id || !items || items.length === 0 || !fulfillment_type) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SECURITY: Validate UUIDs
    if (!isValidUUID(event_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid event ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (table_booking_id && !isValidUUID(table_booking_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid table booking ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SECURITY: Validate fulfillment_type
    if (!["DELIVERY", "PICKUP"].includes(fulfillment_type)) {
      return new Response(
        JSON.stringify({ error: "Invalid fulfillment type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (fulfillment_type === "PICKUP" && !pickup_bar) {
      return new Response(
        JSON.stringify({ error: "pickup_bar required for PICKUP orders" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SECURITY: Validate pickup_bar value
    if (pickup_bar && !["BAR_MAIN", "BAR_PICKUP", "BAR_LOUNGE"].includes(pickup_bar)) {
      return new Response(
        JSON.stringify({ error: "Invalid pickup bar" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SECURITY: Validate email if provided
    if (customer_email && !isValidEmail(customer_email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SECURITY: Validate items array
    if (!Array.isArray(items) || items.length > MAX_ITEMS_PER_ORDER) {
      return new Response(
        JSON.stringify({ error: `Maximum ${MAX_ITEMS_PER_ORDER} items per order` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    for (const item of items) {
      if (!item.drink_id || !isValidUUID(item.drink_id)) {
        return new Response(
          JSON.stringify({ error: "Invalid drink ID in order" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY_PER_ITEM) {
        return new Response(
          JSON.stringify({ error: `Quantity must be between 1 and ${MAX_QUANTITY_PER_ITEM}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Sanitize string inputs
    const sanitizedEmail = customer_email ? sanitizeString(customer_email, 254).toLowerCase() : null;
    const sanitizedName = customer_name ? sanitizeString(customer_name, 200) : null;

    // Fetch drink details and check stock
    const drinkIds = items.map(item => item.drink_id);
    const { data: drinks, error: drinksError } = await supabase
      .from("drinks")
      .select("id, name, price, is_active")
      .in("id", drinkIds);

    if (drinksError || !drinks) {
      throw new Error(`Failed to fetch drinks: ${drinksError?.message}`);
    }

    // Check all drinks are active
    const inactiveDrinks = drinks.filter(d => !d.is_active);
    if (inactiveDrinks.length > 0) {
      return new Response(
        JSON.stringify({ error: "Some drinks are not available" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check stock availability
    const { data: stockData, error: stockError } = await supabase
      .from("drink_stock")
      .select("drink_id, stock_current")
      .eq("event_id", event_id)
      .in("drink_id", drinkIds);

    if (stockError) {
      throw new Error(`Failed to check stock: ${stockError.message}`);
    }

    const stockMap = new Map(stockData?.map(s => [s.drink_id, s.stock_current]) || []);

    for (const item of items) {
      const availableStock = stockMap.get(item.drink_id) || 0;
      if (availableStock < item.quantity) {
        const drink = drinks.find(d => d.id === item.drink_id);
        return new Response(
          JSON.stringify({
            error: "Insufficient stock",
            drink_name: drink?.name,
            available: availableStock,
            requested: item.quantity
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Calculate total
    let totalAmount = 0;
    const orderItems = items.map(item => {
      const drink = drinks.find(d => d.id === item.drink_id)!;
      const subtotal = parseFloat(drink.price.toString()) * item.quantity;
      totalAmount += subtotal;
      return {
        drink_id: item.drink_id,
        quantity: item.quantity,
        unit_price: drink.price
      };
    });

    // Create drink order
    const { data: order, error: orderError } = await supabase
      .from("drink_orders")
      .insert({
        event_id,
        table_booking_id: table_booking_id || null,
        status: "PENDING_PAYMENT",
        fulfillment_type,
        pickup_bar: pickup_bar || null,
        total_amount: totalAmount.toFixed(2),
        customer_email: sanitizedEmail,
        customer_name: sanitizedName
      })
      .select()
      .single();

    if (orderError || !order) {
      throw new Error(`Failed to create order: ${orderError?.message}`);
    }

    // Insert order items
    const { error: itemsError } = await supabase
      .from("drink_order_items")
      .insert(
        orderItems.map(item => ({
          drink_order_id: order.id,
          ...item
        }))
      );

    if (itemsError) {
      throw new Error(`Failed to create order items: ${itemsError.message}`);
    }

    // Create Mollie payment
    // SECURITY: Whitelist allowed redirect origins to prevent open redirect attacks
    const ALLOWED_ORIGINS = [
      'https://bizimevents.be',
      'https://www.bizimevents.be',
      Deno.env.get('BASE_URL'),
    ].filter(Boolean) as string[];

    const requestOrigin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/[^/]*$/, '') || '';
    const sanitizedOrigin = requestOrigin.replace(/\/$/, '');

    let BASE_URL: string;
    if (ALLOWED_ORIGINS.some(allowed => sanitizedOrigin === allowed)) {
      BASE_URL = sanitizedOrigin;
    } else {
      BASE_URL = Deno.env.get('BASE_URL') || 'https://bizimevents.be';
      console.warn(`[create-drink-order] Blocked redirect to untrusted origin: ${sanitizedOrigin}`);
    }

    const webhookUrl = `${supabaseUrl}/functions/v1/mollie-webhook`;
    const successUrl = `${BASE_URL}/#/payment-success?order_id=${order.id}&type=drink`;

    const molliePayment = await fetch("https://api.mollie.com/v2/payments", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${mollieApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: {
          currency: "EUR",
          value: totalAmount.toFixed(2),
        },
        description: `Drinks Order - Event`,
        redirectUrl: successUrl,
        webhookUrl: webhookUrl,
        metadata: {
          type: "drink_order",
          order_id: order.id,
          event_id: event_id,
        },
      }),
    });

    if (!molliePayment.ok) {
      const errorText = await molliePayment.text();
      throw new Error(`Mollie API error: ${errorText}`);
    }

    const mollieData = await molliePayment.json();

    // Update order with Mollie payment ID
    await supabase
      .from("drink_orders")
      .update({ mollie_payment_id: mollieData.id })
      .eq("id", order.id);

    return new Response(
      JSON.stringify({
        order_id: order.id,
        payment_url: mollieData._links.checkout.href,
        total_amount: totalAmount.toFixed(2),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error creating drink order:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});