import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";

interface HoldRequest {
  seat_ids: string[];
  event_id: string;
  session_id: string;
  hold_minutes?: number;
}

interface ReleaseRequest {
  hold_ids: string[];
  session_id: string;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return handleCorsOptions(req);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const url = new URL(req.url);
    const path = url.pathname.split("/").pop();

    if (req.method === "POST" && path === "hold-seats") {
      const body: HoldRequest = await req.json();
      const { seat_ids, event_id, session_id, hold_minutes = 10 } = body;

      if (
        !seat_ids?.length ||
        !event_id ||
        !session_id ||
        seat_ids.length > 10
      ) {
        return new Response(
          JSON.stringify({ error: "Invalid request parameters" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: allowed } = await supabase.rpc(
        "check_seat_hold_rate_limit",
        { p_user_id: null, p_session_id: session_id },
      );
      if (!allowed) {
        return new Response(
          JSON.stringify({ error: "Rate limited. Try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      await supabase.rpc("release_expired_holds");

      const { count: totalSessionHolds } = await supabase
        .from("seat_holds")
        .select("id", { count: "exact", head: true })
        .eq("session_id", session_id)
        .eq("status", "held");

      if ((totalSessionHolds ?? 0) >= 10) {
        return new Response(
          JSON.stringify({ error: "Maximum 10 stoelen per sessie" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: existingHolds } = await supabase
        .from("seat_holds")
        .select("id, seat_id")
        .eq("session_id", session_id)
        .eq("event_id", event_id)
        .eq("status", "held");

      if (existingHolds && existingHolds.length > 0) {
        const existingSeatIds = existingHolds.map((h: any) => h.seat_id);
        const holdIdsToRelease = existingHolds
          .filter((h: any) => !seat_ids.includes(h.seat_id))
          .map((h: any) => h.id);

        if (holdIdsToRelease.length > 0) {
          const releaseSeatIds = existingHolds
            .filter((h: any) => holdIdsToRelease.includes(h.id))
            .map((h: any) => h.seat_id);

          await supabase
            .from("seat_holds")
            .update({ status: "released" })
            .in("id", holdIdsToRelease);

          await supabase
            .from("seats")
            .update({ status: "available" })
            .in("id", releaseSeatIds);
        }

        const newSeatIds = seat_ids.filter(
          (id: string) => !existingSeatIds.includes(id),
        );
        if (newSeatIds.length === 0) {
          const keptHolds = existingHolds.filter((h: any) =>
            seat_ids.includes(h.seat_id),
          );
          const expiresAt = keptHolds[0]
            ? (await supabase
                .from("seat_holds")
                .select("expires_at")
                .eq("id", keptHolds[0].id)
                .single()).data?.expires_at
            : null;

          return new Response(
            JSON.stringify({
              hold_ids: keptHolds.map((h: any) => h.id),
              expires_at: expiresAt,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        const { data: checkSeats, error: checkErr } = await supabase
          .from("seats")
          .select("id, status")
          .in("id", newSeatIds)
          .eq("is_active", true);

        if (checkErr) throw checkErr;

        const unavailable = (checkSeats ?? []).filter(
          (s: any) => s.status !== "available",
        );
        if (unavailable.length > 0) {
          return new Response(
            JSON.stringify({
              error: "Some seats are no longer available",
              unavailable_ids: unavailable.map((s: any) => s.id),
            }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        const expiresAt = new Date(
          Date.now() + hold_minutes * 60_000,
        ).toISOString();

        const newHolds = newSeatIds.map((seat_id: string) => ({
          seat_id,
          event_id,
          user_id: null,
          session_id,
          expires_at: expiresAt,
          status: "held",
        }));

        const { data: holdData, error: holdErr } = await supabase
          .from("seat_holds")
          .insert(newHolds)
          .select();
        if (holdErr) throw holdErr;

        await supabase
          .from("seats")
          .update({ status: "reserved" })
          .in("id", newSeatIds);

        const allHoldIds = [
          ...existingHolds
            .filter((h: any) => seat_ids.includes(h.seat_id))
            .map((h: any) => h.id),
          ...(holdData ?? []).map((h: any) => h.id),
        ];

        return new Response(
          JSON.stringify({ hold_ids: allHoldIds, expires_at: expiresAt }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: checkSeats, error: checkErr } = await supabase
        .from("seats")
        .select("id, status")
        .in("id", seat_ids)
        .eq("is_active", true);

      if (checkErr) throw checkErr;

      const unavailable = (checkSeats ?? []).filter(
        (s: any) => s.status !== "available",
      );
      if (unavailable.length > 0) {
        return new Response(
          JSON.stringify({
            error: "Some seats are no longer available",
            unavailable_ids: unavailable.map((s: any) => s.id),
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if ((checkSeats ?? []).length !== seat_ids.length) {
        return new Response(
          JSON.stringify({ error: "Some seats not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const expiresAt = new Date(
        Date.now() + hold_minutes * 60_000,
      ).toISOString();

      const holds = seat_ids.map((seat_id: string) => ({
        seat_id,
        event_id,
        user_id: null,
        session_id,
        expires_at: expiresAt,
        status: "held",
      }));

      const { data: holdData, error: holdErr } = await supabase
        .from("seat_holds")
        .insert(holds)
        .select();
      if (holdErr) throw holdErr;

      await supabase
        .from("seats")
        .update({ status: "reserved" })
        .in("id", seat_ids);

      return new Response(
        JSON.stringify({
          hold_ids: (holdData ?? []).map((h: any) => h.id),
          expires_at: expiresAt,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (req.method === "POST" && path === "release") {
      const body: ReleaseRequest = await req.json();
      const { hold_ids, session_id } = body;

      if (!hold_ids?.length || !session_id) {
        return new Response(
          JSON.stringify({ error: "Invalid request parameters" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: holds, error: fetchErr } = await supabase
        .from("seat_holds")
        .select("id, seat_id")
        .in("id", hold_ids)
        .eq("session_id", session_id)
        .eq("status", "held");
      if (fetchErr) throw fetchErr;

      const seatIds = (holds ?? []).map((h: any) => h.seat_id);
      const validHoldIds = (holds ?? []).map((h: any) => h.id);

      if (validHoldIds.length > 0) {
        await supabase
          .from("seat_holds")
          .update({ status: "released" })
          .in("id", validHoldIds);

        await supabase
          .from("seats")
          .update({ status: "available" })
          .in("id", seatIds);
      }

      return new Response(
        JSON.stringify({ released: validHoldIds.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "Not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
