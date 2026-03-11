import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["SUPER_ADMIN", "ADMIN", "SCANNER"])
      .maybeSingle();

    if (!userRole) {
      return new Response(
        JSON.stringify({ error: "Insufficient permissions" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { order_id, action } = await req.json();

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: "order_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "deliver") {
      try {
        const { data, error } = await supabase.rpc("mark_drink_order_delivered", {
          p_order_id: order_id,
          p_delivered_by: user.id
        });

        if (error) {
          if (error.message.includes("ALREADY_DELIVERED")) {
            return new Response(
              JSON.stringify({ error: "Order has already been delivered" }),
              { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          throw error;
        }

        return new Response(
          JSON.stringify({ success: true, message: "Order marked as delivered" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error) {
        throw new Error(`Delivery operation failed: ${error.message}`);
      }
    }

    if (action === "in_progress") {
      const { error } = await supabase
        .from("drink_orders")
        .update({ status: "IN_PROGRESS", updated_at: new Date().toISOString() })
        .eq("id", order_id)
        .in("status", ["PAID"]);

      if (error) {
        throw error;
      }

      return new Response(
        JSON.stringify({ success: true, message: "Order marked as in progress" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "ready") {
      const { error } = await supabase
        .from("drink_orders")
        .update({ status: "READY", updated_at: new Date().toISOString() })
        .eq("id", order_id)
        .in("status", ["PAID", "IN_PROGRESS"]);

      if (error) {
        throw error;
      }

      return new Response(
        JSON.stringify({ success: true, message: "Order marked as ready" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use: in_progress, ready, or deliver" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error updating drink order:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});