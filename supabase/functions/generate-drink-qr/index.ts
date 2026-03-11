import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { getCorsHeaders } from "../_shared/cors.ts";
import { signQrPayload } from "../_shared/qr-sign.ts";

async function generateQRPayload(orderId: string, eventId: string): Promise<string> {
  const payload = await signQrPayload({
    v: 2,
    type: "DRINK_ORDER",
    order_id: orderId,
    event_id: eventId,
  });
  return JSON.stringify(payload);
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { order_id } = await req.json();

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: "order_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: order, error: orderError } = await supabase
      .from("drink_orders")
      .select("id, event_id, qr_code")
      .eq("id", order_id)
      .maybeSingle();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: "Drink order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (order.qr_code) {
      return new Response(
        JSON.stringify({ qr_code: order.qr_code }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const qrPayload = await generateQRPayload(order.id, order.event_id);

    const { error: updateError } = await supabase
      .from("drink_orders")
      .update({ qr_code: qrPayload })
      .eq("id", order_id);

    if (updateError) {
      throw new Error(`Failed to save QR code: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({ qr_code: qrPayload }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating drink order QR:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});