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
        floorplan_table_id,
        customer_name,
        customer_email,
        number_of_guests,
        status,
        checked_in_at,
        checked_in_by,
        check_in_count,
        paid_at,
        floorplan_tables:floorplan_table_id (
          table_number,
          table_name,
          capacity
        ),
        events:event_id (
          name,
          start_date,
          end_date
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
        JSON.stringify({
          is_valid: false,
          error: "Booking not found or event mismatch",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const isPaid = booking.status === "paid" && booking.paid_at !== null;
    const isAlreadyCheckedIn = booking.checked_in_at !== null;

    return new Response(
      JSON.stringify({
        is_valid: isPaid,
        already_checked_in: isAlreadyCheckedIn,
        booking: {
          id: booking.id,
          customer_name: booking.customer_name,
          customer_email: booking.customer_email,
          number_of_guests: booking.number_of_guests,
          status: booking.status,
          checked_in_at: booking.checked_in_at,
          checked_in_by: booking.checked_in_by,
          check_in_count: booking.check_in_count,
          paid_at: booking.paid_at,
          table: booking.floorplan_tables,
          event: booking.events,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in validate-table-booking:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});