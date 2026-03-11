import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: cors });
  }

  try {
    // --- Auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ success: false, error: "Missing authorization header" }, 401, cors);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.replace("Bearer ", "");

    const admin = createClient(supabaseUrl, serviceKey);

    // Validate user token
    const { data: { user }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !user) {
      return json({ success: false, error: "Invalid or expired token" }, 401, cors);
    }

    // Check admin role
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("is_active", true);

    const userRole = roles?.find((r) =>
      ["admin", "super_admin", "superadmin"].includes(r.role)
    )?.role;
    if (!userRole) {
      return json({ success: false, error: "Insufficient permissions" }, 403, cors);
    }

    const isSuperAdmin = ["super_admin", "superadmin"].includes(userRole);

    // --- Parse body ---
    const body = await req.json();
    const { action } = body;

    // --- Actions ---
    switch (action) {
      // ─── Delete Guest Ticket (cascading, atomic) ── SUPER_ADMIN ONLY ───
      case "delete_guest_ticket": {
        if (!isSuperAdmin) {
          return json({ success: false, error: "Only super admins can delete guest tickets" }, 403, cors);
        }
        const { order_id } = body;
        if (!order_id || !UUID_RE.test(order_id)) {
          return json({ success: false, error: "Valid order_id is required" }, 400, cors);
        }

        // Verify the order exists and is a comped (guest) ticket
        const { data: order, error: orderErr } = await admin
          .from("orders")
          .select("id, status")
          .eq("id", order_id)
          .eq("status", "comped")
          .maybeSingle();

        if (orderErr || !order) {
          return json({ success: false, error: "Guest ticket order not found" }, 404, cors);
        }

        // Cascading delete in correct order (FK constraints)
        const { error: e1 } = await admin.from("guest_ticket_qrs").delete().eq("order_id", order_id);
        if (e1) {
          console.error("[admin-manage] delete guest_ticket_qrs:", e1.message);
          return json({ success: false, error: "Failed to delete QR records" }, 500, cors);
        }

        const { error: e2 } = await admin.from("tickets").delete().eq("order_id", order_id);
        if (e2) {
          console.error("[admin-manage] delete tickets:", e2.message);
          return json({ success: false, error: "Failed to delete tickets" }, 500, cors);
        }

        const { error: e3 } = await admin.from("guest_ticket_audit_log").delete().eq("order_id", order_id);
        if (e3) {
          console.error("[admin-manage] delete audit_log:", e3.message);
          // Non-critical, continue
        }

        // Delete email_logs before order (FK RESTRICT)
        await admin.from("email_logs").delete().eq("order_id", order_id);

        const { error: e4 } = await admin.from("orders").delete().eq("id", order_id).eq("status", "comped");
        if (e4) {
          console.error("[admin-manage] delete order:", e4.message);
          return json({ success: false, error: "Failed to delete order" }, 500, cors);
        }

        return json({ success: true, message: "Guest ticket deleted" }, 200, cors);
      }

      // ─── Delete Table Guest ── SUPER_ADMIN ONLY ───
      case "delete_table_guest": {
        if (!isSuperAdmin) {
          return json({ success: false, error: "Only super admins can delete table guests" }, 403, cors);
        }
        const { guest_id } = body;
        if (!guest_id || !UUID_RE.test(guest_id)) {
          return json({ success: false, error: "Valid guest_id is required" }, 400, cors);
        }

        const { error } = await admin.from("table_guests").delete().eq("id", guest_id);
        if (error) {
          console.error("[admin-manage] delete table_guest:", error.message);
          return json({ success: false, error: "Failed to delete table guest" }, 500, cors);
        }

        return json({ success: true, message: "Table guest deleted" }, 200, cors);
      }

      // ─── Resolve Refund Claim (approve/reject) ───
      case "resolve_refund_claim": {
        const { claim_id, resolution } = body;
        if (!claim_id || !UUID_RE.test(claim_id)) {
          return json({ success: false, error: "Valid claim_id is required" }, 400, cors);
        }
        if (resolution !== "approved" && resolution !== "rejected") {
          return json({ success: false, error: "resolution must be 'approved' or 'rejected'" }, 400, cors);
        }

        // Fetch the claim to get order amount for approval
        const { data: claim, error: claimErr } = await admin
          .from("refund_claims")
          .select("id, status, orders(total_amount)")
          .eq("id", claim_id)
          .eq("status", "pending")
          .maybeSingle();

        if (claimErr || !claim) {
          return json({ success: false, error: "Pending refund claim not found" }, 404, cors);
        }

        const updateData: Record<string, unknown> = {
          status: resolution,
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
        };

        if (resolution === "approved") {
          updateData.refund_amount_cents = (claim.orders as any)?.total_amount || 0;
        }

        const { error: updateErr } = await admin
          .from("refund_claims")
          .update(updateData)
          .eq("id", claim_id);

        if (updateErr) {
          console.error("[admin-manage] resolve refund claim:", updateErr.message);
          return json({ success: false, error: "Failed to update refund claim" }, 500, cors);
        }

        return json({ success: true, message: `Refund claim ${resolution}` }, 200, cors);
      }

      // ─── Save Refund Protection Config ───
      case "save_refund_config": {
        const { event_id, is_enabled, fee_type, fee_value } = body;
        if (!event_id || !UUID_RE.test(event_id)) {
          return json({ success: false, error: "Valid event_id is required" }, 400, cors);
        }
        if (typeof is_enabled !== "boolean") {
          return json({ success: false, error: "is_enabled must be a boolean" }, 400, cors);
        }
        if (fee_type !== "percentage" && fee_type !== "fixed") {
          return json({ success: false, error: "fee_type must be 'percentage' or 'fixed'" }, 400, cors);
        }

        const parsedFee = parseFloat(fee_value);
        if (isNaN(parsedFee) || parsedFee < 0 || parsedFee > 100) {
          return json({ success: false, error: "fee_value must be between 0 and 100" }, 400, cors);
        }

        const { error } = await admin
          .from("refund_protection_config")
          .upsert(
            {
              event_id,
              is_enabled,
              fee_type,
              fee_value: parsedFee,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "event_id" }
          );

        if (error) {
          console.error("[admin-manage] save refund config:", error.message);
          return json({ success: false, error: "Failed to save config" }, 500, cors);
        }

        return json({ success: true, message: "Config saved" }, 200, cors);
      }

      default:
        return json({ success: false, error: `Unknown action: ${action}` }, 400, cors);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[admin-manage] Unhandled error:", message);
    return json({ success: false, error: message }, 500, cors);
  }
});
