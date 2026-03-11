import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { getCorsHeaders } from "../_shared/cors.ts";

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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { booking_id, event_id } = await req.json();

    if (!booking_id || !event_id) {
      return new Response(
        JSON.stringify({ error: "booking_id and event_id are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: booking, error: fetchError } = await supabase
      .from("table_bookings")
      .select(`
        id,
        event_id,
        status,
        checked_in_at,
        checked_in_by,
        check_in_count,
        paid_at,
        customer_name,
        number_of_guests,
        floorplan_tables:floorplan_table_id (
          table_number,
          table_name
        )
      `)
      .eq("id", booking_id)
      .eq("event_id", event_id)
      .maybeSingle();

    if (fetchError) {
      console.error("Error fetching booking:", fetchError);
      return new Response(
        JSON.stringify({ error: "Database error" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!booking) {
      return new Response(
        JSON.stringify({ error: "Booking not found or event mismatch" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (booking.status !== "paid" || !booking.paid_at) {
      return new Response(
        JSON.stringify({ error: "Booking is not paid" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (booking.checked_in_at) {
      return new Response(
        JSON.stringify({
          already_checked_in: true,
          message: "Booking already checked in",
          checked_in_at: booking.checked_in_at,
          checked_in_by: booking.checked_in_by,
          check_in_count: booking.check_in_count,
          booking: {
            customer_name: booking.customer_name,
            number_of_guests: booking.number_of_guests,
            table: booking.floorplan_tables,
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { error: updateError } = await supabase
      .from("table_bookings")
      .update({
        checked_in_at: new Date().toISOString(),
        checked_in_by: user.id,
        check_in_count: (booking.check_in_count || 0) + 1,
      })
      .eq("id", booking_id);

    if (updateError) {
      console.error("Error updating check-in:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to check in" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Check-in successful",
        checked_in_at: new Date().toISOString(),
        booking: {
          customer_name: booking.customer_name,
          number_of_guests: booking.number_of_guests,
          table: booking.floorplan_tables,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in check-in-table-booking:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});