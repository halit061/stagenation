import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  function jsonResponse(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // 1. Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ success: false, error: "Missing Authorization header", code: "NO_AUTH" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return jsonResponse({ success: false, error: "Invalid or expired token", code: "INVALID_JWT" }, 401);
    }

    // 2. Admin role check
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true);

    const isAdmin = roles?.some(
      (r: { role: string }) =>
        r.role === "admin" || r.role === "super_admin" || r.role === "superadmin"
    );

    if (!isAdmin) {
      return jsonResponse({ success: false, error: "Insufficient permissions", code: "FORBIDDEN" }, 403);
    }

    // 3. Parse request
    const { order_id } = await req.json();
    if (!order_id) {
      return jsonResponse({ success: false, error: "Missing order_id" }, 400);
    }

    // 4. Verify order exists and is cancellable
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, order_number, status, payer_email, payer_name, total_amount, event_id")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return jsonResponse({ success: false, error: "Order not found" }, 404);
    }

    if (order.status === "cancelled" || order.status === "refunded") {
      return jsonResponse({ success: false, error: `Order is already ${order.status}` }, 409);
    }

    if (order.status !== "paid" && order.status !== "pending") {
      return jsonResponse({ success: false, error: `Cannot cancel order with status '${order.status}'` }, 400);
    }

    // 5. Revoke all active tickets for this order
    const { data: tickets } = await supabase
      .from("tickets")
      .select("id, status")
      .eq("order_id", order_id);

    const activeTicketIds = (tickets || [])
      .filter((t: { status: string }) => t.status !== "revoked")
      .map((t: { id: string }) => t.id);

    if (activeTicketIds.length > 0) {
      const { error: revokeError } = await supabase
        .from("tickets")
        .update({
          status: "revoked",
          revoked_at: new Date().toISOString(),
          revoked_reason: `Order cancelled by admin (${user.email})`,
        })
        .in("id", activeTicketIds);

      if (revokeError) {
        return jsonResponse({ success: false, error: `Failed to revoke tickets: ${revokeError.message}` }, 500);
      }
    }

    // 6. Atomically restore ticket stock using existing DB function
    const { error: rollbackError } = await supabase.rpc("atomic_rollback_ticket_stock", {
      p_order_id: order_id,
    });

    if (rollbackError) {
      // Log but don't fail - tickets are already revoked, stock rollback is best-effort
      console.error("Stock rollback error:", rollbackError.message);
    }

    // 7. Set order status to cancelled
    const { error: cancelError } = await supabase
      .from("orders")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
        metadata: {
          ...(order as any).metadata,
          cancelled_by: user.email,
          cancelled_at: new Date().toISOString(),
        },
      })
      .eq("id", order_id);

    if (cancelError) {
      return jsonResponse({ success: false, error: `Failed to cancel order: ${cancelError.message}` }, 500);
    }

    return jsonResponse({
      success: true,
      order_number: order.order_number,
      tickets_revoked: activeTicketIds.length,
      message: `Order ${order.order_number} cancelled successfully`,
    });
  } catch (error: any) {
    console.error("cancel-order error:", error);
    return jsonResponse({ success: false, error: error.message || "Internal server error" }, 500);
  }
});
