import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import QRCode from "npm:qrcode@1.5.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { signQrPayload } from "../_shared/qr-sign.ts";

interface QRPayload {
  v: number;
  type: string;
  booking_id: string;
  event_id: string;
  table_id: string;
  sig?: string;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { booking_id } = await req.json();

    if (!booking_id) {
      return new Response(
        JSON.stringify({ error: "booking_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: booking, error: fetchError } = await supabase
      .from("table_bookings")
      .select("id, event_id, floorplan_table_id, qr_payload, qr_code")
      .eq("id", booking_id)
      .single();

    if (fetchError || !booking) {
      return new Response(
        JSON.stringify({ error: "Booking not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (booking.qr_payload && booking.qr_code) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "QR code already exists",
          qr_payload: booking.qr_payload,
          qr_code: booking.qr_code,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const qrPayload: QRPayload = await signQrPayload({
      v: 2,
      type: "TABLE",
      booking_id: booking.id,
      event_id: booking.event_id,
      table_id: booking.floorplan_table_id,
    });

    const qrCodeDataUrl = await QRCode.toDataURL(JSON.stringify(qrPayload), {
      width: 512,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });

    const { error: updateError } = await supabase
      .from("table_bookings")
      .update({
        qr_payload: qrPayload,
        qr_code: qrCodeDataUrl,
      })
      .eq("id", booking_id);

    if (updateError) {
      console.error("Error updating booking with QR code:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to save QR code" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        qr_payload: qrPayload,
        qr_code: qrCodeDataUrl,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in generate-table-qr:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});