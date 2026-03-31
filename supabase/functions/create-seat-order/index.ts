import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ALLOWED_ORIGINS = [
  "https://stagenation.be",
  "https://www.stagenation.be",
  "http://localhost:5173",
];

function jsonRes(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function mollieWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2,
): Promise<Response> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      if (res.status === 429 && attempt < maxRetries) {
        attempt++;
        const retryAfter = res.headers.get("Retry-After");
        const waitMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.min(300 * Math.pow(2, attempt), 3000);
        await new Promise((r) => setTimeout(r, waitMs + Math.random() * 150));
        continue;
      }
      if (res.status >= 500 && attempt < maxRetries) {
        attempt++;
        await new Promise((r) =>
          setTimeout(r, 500 + Math.random() * 150)
        );
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timeout);
      if (attempt < maxRetries) {
        attempt++;
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      throw err;
    }
  }
  return await fetch(url, options);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonRes({ error: "Method not allowed" }, 405);
    }

    const body = await req.json();

    const {
      p_event_id,
      p_customer_first_name,
      p_customer_last_name,
      p_customer_email,
      p_customer_phone,
      p_subtotal,
      p_service_fee,
      p_total_amount,
      p_payment_method,
      p_notes,
      p_session_id,
      p_seat_ids,
      p_seat_prices,
      p_ticket_type_id,
    } = body;

    if (
      !p_event_id ||
      !p_customer_first_name ||
      !p_customer_last_name ||
      !p_customer_email
    ) {
      return jsonRes({ error: "Missing required fields" }, 400);
    }

    if (!p_seat_ids || !Array.isArray(p_seat_ids) || p_seat_ids.length === 0) {
      return jsonRes({ error: "No seats provided" }, 400);
    }

    if (p_seat_ids.length > 20) {
      return jsonRes({ error: "Too many seats" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const mollieApiKey = Deno.env.get("MOLLIE_API_KEY");

    if (!supabaseUrl || !serviceKey) {
      console.error("[create-seat-order] Missing SUPABASE env vars");
      return jsonRes({ error: "Server configuration error" }, 500);
    }

    if (!mollieApiKey) {
      console.error("[create-seat-order] Missing MOLLIE_API_KEY");
      return jsonRes({ error: "Payment service not configured" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data, error } = await supabase.rpc("create_seat_order_pending", {
      p_event_id,
      p_customer_first_name,
      p_customer_last_name,
      p_customer_email,
      p_customer_phone: p_customer_phone || null,
      p_subtotal: p_subtotal ?? 0,
      p_service_fee: p_service_fee ?? 0,
      p_total_amount: p_total_amount ?? 0,
      p_payment_method: p_payment_method || null,
      p_notes: p_notes || null,
      p_session_id: p_session_id || null,
      p_seat_ids,
      p_seat_prices: p_seat_prices || [],
      p_ticket_type_id: p_ticket_type_id || null,
    });

    if (error) {
      console.error("[create-seat-order] RPC error:", error.message);
      return jsonRes({ error: error.message }, 500);
    }

    if (!data || !data.success) {
      return jsonRes(
        { success: false, error: data?.error || "order_creation_failed" },
        200,
      );
    }

    const orderId = data.order_id;
    const orderNumber = data.order_number;
    const totalAmountCents = data.total_amount_cents;
    const amountInEuros = (totalAmountCents / 100).toFixed(2);

    const requestOrigin = req.headers.get("origin") ||
      req.headers.get("referer")?.replace(/\/[^/]*$/, "") || "";
    const sanitizedOrigin = requestOrigin.replace(/\/$/, "");

    let baseUrl: string;
    if (ALLOWED_ORIGINS.some((allowed) => sanitizedOrigin === allowed)) {
      baseUrl = sanitizedOrigin;
    } else {
      baseUrl = Deno.env.get("BASE_URL") || "https://stagenation.be";
    }

    const redirectUrl =
      `${baseUrl}/seat-confirmation?event=${p_event_id}&order=${orderId}`;
    const cancelUrl =
      `${baseUrl}/seat-picker?event=${p_event_id}&payment=canceled`;
    const webhookUrl = `${supabaseUrl}/functions/v1/mollie-webhook`;

    const mollieIdempotencyKey = `order:${orderId}`;

    const mollieResponse = await mollieWithRetry(
      "https://api.mollie.com/v2/payments",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${mollieApiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": mollieIdempotencyKey,
        },
        body: JSON.stringify({
          amount: { currency: "EUR", value: amountInEuros },
          description: "StageNation Tickets",
          redirectUrl,
          cancelUrl,
          webhookUrl,
          metadata: {
            orderId,
            orderNumber,
            email: p_customer_email,
            event_id: p_event_id,
            type: "tickets",
            brand: "stagenation",
          },
          method: null,
        }),
      },
    );

    if (!mollieResponse.ok) {
      const errBody = await mollieResponse.text();
      console.error(
        "[create-seat-order] Mollie error:",
        mollieResponse.status,
        errBody,
      );
      return jsonRes(
        { error: "Payment creation failed. Please retry." },
        502,
      );
    }

    const payment = await mollieResponse.json();

    await supabase
      .from("orders")
      .update({ payment_id: payment.id })
      .eq("id", orderId);

    return jsonRes(
      {
        success: true,
        order_id: orderId,
        order_number: orderNumber,
        checkoutUrl: payment._links.checkout.href,
      },
      200,
    );
  } catch (err: any) {
    console.error("[create-seat-order] Exception:", err);
    return jsonRes(
      { error: err.message || "Internal server error" },
      500,
    );
  }
});
