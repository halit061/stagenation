import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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

    if (!p_event_id || !p_customer_first_name || !p_customer_last_name || !p_customer_email) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!p_seat_ids || !Array.isArray(p_seat_ids) || p_seat_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "No seats provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (p_seat_ids.length > 20) {
      return new Response(
        JSON.stringify({ error: "Too many seats" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
