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

  function errorResponse(error: string, status = 400, code?: string) {
    return jsonResponse({ success: false, error, code }, status);
  }
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse("Missing Authorization header", 401, "NO_AUTH");
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(supabaseUrl, serviceRoleKey);
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !user) {
      return errorResponse("Invalid or expired token", 401, "INVALID_JWT");
    }

    const { data: roles } = await authClient
      .from("user_roles")
      .select("role, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true);

    const isAdmin = roles?.some(
      (r: { role: string }) =>
        r.role === "admin" || r.role === "super_admin" || r.role === "superadmin"
    );

    if (!isAdmin) {
      return errorResponse("Insufficient permissions", 403, "FORBIDDEN");
    }

    const { action, event_id } = await req.json();

    switch (action) {
      case "dashboard": {
        const [eventsRes, ordersRes] = await Promise.all([
          authClient
            .from("events")
            .select("*")
            .order("start_date", { ascending: false }),
          authClient
            .from("orders")
            .select("*, events(name)")
            .order("created_at", { ascending: false }),
        ]);
        return jsonResponse({
          success: true,
          events: eventsRes.data || [],
          orders: ordersRes.data || [],
        });
      }

      case "tickets": {
        const { data } = await authClient
          .from("tickets")
          .select(
            "*, ticket_types(name), orders(order_number, payer_name, payer_email, status), events(name)"
          )
          .order("created_at", { ascending: false });
        return jsonResponse({ success: true, tickets: data || [] });
      }

      case "guest_tickets": {
        const { data } = await authClient
          .from("orders")
          .select(
            "*, events(name), tickets(id, ticket_number, ticket_types(name)), guest_ticket_qrs(id, person_index, used_at, name, seat_id, section_name, row_label, seat_number)"
          )
          .eq("status", "comped")
          .order("created_at", { ascending: false });
        return jsonResponse({ success: true, guest_tickets: data || [] });
      }

      case "table_guests": {
        const { data } = await authClient
          .from("table_guests")
          .select("*, events(name), floorplan_tables(table_number, capacity)")
          .order("created_at", { ascending: false });
        return jsonResponse({ success: true, table_guests: data || [] });
      }

      case "floorplan_tables": {
        if (!event_id)
          return errorResponse("event_id required", 400);
        const { data } = await authClient
          .from("floorplan_tables")
          .select("*")
          .eq("event_id", event_id)
          .order("table_number");
        return jsonResponse({ success: true, tables: data || [] });
      }

      case "ticket_types": {
        if (!event_id)
          return errorResponse("event_id required", 400);
        const { data } = await authClient
          .from("ticket_types")
          .select("*")
          .eq("event_id", event_id)
          .eq("is_active", true)
          .order("price");
        return jsonResponse({ success: true, ticket_types: data || [] });
      }

      case "venue_zones": {
        if (!event_id)
          return errorResponse("event_id required", 400);
        const { data } = await authClient
          .from("venue_zones")
          .select("*, ticket_types(name, color, price)")
          .eq("event_id", event_id)
          .order("sort_order");
        return jsonResponse({ success: true, venue_zones: data || [] });
      }

      case "venue_config": {
        if (!event_id)
          return errorResponse("event_id required", 400);
        const { data } = await authClient
          .from("events")
          .select("venue_map_config")
          .eq("id", event_id)
          .single();
        return jsonResponse({
          success: true,
          config: data?.venue_map_config || null,
        });
      }

      case "table_assignment_counts": {
        if (!event_id)
          return errorResponse("event_id required", 400);
        const { data } = await authClient
          .from("orders")
          .select("assigned_table_id")
          .eq("event_id", event_id)
          .eq("status", "comped")
          .not("assigned_table_id", "is", null);
        return jsonResponse({
          success: true,
          assignments: data || [],
        });
      }

      default:
        return errorResponse(`Unknown action: ${action}`, 400);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 500, "INTERNAL_ERROR");
  }
});
