import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Verify the caller is an admin/super_admin
  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
  } = await supabase.auth.getUser(token);
  if (!user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const isAdmin = roles?.some(
    (r: any) => r.role === "super_admin" || r.role === "admin"
  );
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const results: string[] = [];

    // Date: Sunday June 21, 2026 - Brussels timezone (CEST = UTC+2)
    const baseDate = "2026-06-21";
    const scanTime11 = `${baseDate}T11:00:00+02:00`;
    const scanTime1415 = `${baseDate}T14:15:00+02:00`;

    // Get all events (should be one main event)
    const { data: events } = await supabase
      .from("events")
      .select("id")
      .limit(5);
    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ error: "No events found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eventId = events[0].id;
    results.push(`Event ID: ${eventId}`);

    // 1. Get ALL tickets for this event that are not yet scanned
    const { data: allTickets, error: ticketsErr } = await supabase
      .from("tickets")
      .select("id, status, ticket_number")
      .eq("event_id", eventId)
      .in("status", ["sold", "valid"])
      .limit(50000);

    if (ticketsErr) {
      results.push(`Error fetching tickets: ${ticketsErr.message}`);
    }

    const ticketCount = allTickets?.length || 0;
    results.push(`Found ${ticketCount} unscanned tickets`);

    // 2. Get ALL ticket_seats that are not yet scanned
    const { data: allTicketSeats, error: tsErr } = await supabase
      .from("ticket_seats")
      .select("id, ticket_id, seat_id, is_scanned")
      .eq("event_id", eventId)
      .eq("is_scanned", false)
      .limit(50000);

    if (tsErr) {
      results.push(`Error fetching ticket_seats: ${tsErr.message}`);
    }

    const seatTicketCount = allTicketSeats?.length || 0;
    results.push(`Found ${seatTicketCount} unscanned seat tickets`);

    // 3. Find seats in row "dz" with seat_number 10-17
    const { data: dzSeats } = await supabase
      .from("seats")
      .select("id, row_label, seat_number")
      .ilike("row_label", "dz")
      .gte("seat_number", 10)
      .lte("seat_number", 17);

    const dzSeatIds = new Set((dzSeats || []).map((s: any) => s.id));
    results.push(
      `Found ${dzSeatIds.size} seats in row DZ (10-17): ${JSON.stringify(dzSeats?.map((s: any) => `${s.row_label}-${s.seat_number}`))}`
    );

    // 4. Mark regular tickets as scanned - alternate between 11:00 and 14:15
    if (allTickets && allTickets.length > 0) {
      // Batch update in chunks
      const batchSize = 200;
      for (let i = 0; i < allTickets.length; i += batchSize) {
        const batch = allTickets.slice(i, i + batchSize);
        const ids = batch.map((t: any) => t.id);

        // Alternate scan times: first half at 11:00, second half at 14:15
        const scanTime = i < allTickets.length / 2 ? scanTime11 : scanTime1415;

        const { error: updateErr } = await supabase
          .from("tickets")
          .update({
            status: "used",
            used_at: scanTime,
            scanned_at: scanTime,
            scan_status: "used",
          })
          .in("id", ids);

        if (updateErr) {
          results.push(
            `Error updating tickets batch ${i}: ${updateErr.message}`
          );
        }

        // Insert scan records
        const scanRecords = batch.map((t: any) => ({
          ticket_id: t.id,
          event_id: eventId,
          result: "valid",
          scanned_at: scanTime,
          device_info: { source: "bulk-mark", note: "post-event marking" },
          metadata: {},
        }));

        const { error: scanInsertErr } = await supabase
          .from("scans")
          .insert(scanRecords);

        if (scanInsertErr) {
          results.push(
            `Error inserting scans batch ${i}: ${scanInsertErr.message}`
          );
        }
      }
      results.push(`Marked ${allTickets.length} regular tickets as scanned`);
    }

    // 5. Mark seat tickets as scanned
    if (allTicketSeats && allTicketSeats.length > 0) {
      // Separate DZ 10-17 from others
      const dzTicketSeats = allTicketSeats.filter((ts: any) =>
        dzSeatIds.has(ts.seat_id)
      );
      const otherTicketSeats = allTicketSeats.filter(
        (ts: any) => !dzSeatIds.has(ts.seat_id)
      );

      results.push(
        `DZ 10-17 seat tickets: ${dzTicketSeats.length}, Other seat tickets: ${otherTicketSeats.length}`
      );

      // Mark DZ 10-17 with times between 13:00 and 13:20
      if (dzTicketSeats.length > 0) {
        for (let i = 0; i < dzTicketSeats.length; i++) {
          const ts = dzTicketSeats[i];
          // Spread times evenly between 13:00 and 13:20
          const minuteOffset = Math.floor(
            (i / Math.max(1, dzTicketSeats.length - 1)) * 20
          );
          const secondOffset = Math.floor(Math.random() * 59);
          const scanTime = `${baseDate}T13:${String(minuteOffset).padStart(2, "0")}:${String(secondOffset).padStart(2, "0")}+02:00`;

          const { error: updateErr } = await supabase
            .from("ticket_seats")
            .update({
              is_scanned: true,
              scanned_at: scanTime,
            })
            .eq("id", ts.id);

          if (updateErr) {
            results.push(
              `Error updating DZ seat ${ts.id}: ${updateErr.message}`
            );
          }

          // Also update the parent ticket
          if (ts.ticket_id) {
            await supabase
              .from("tickets")
              .update({
                status: "used",
                used_at: scanTime,
                scanned_at: scanTime,
                scan_status: "used",
              })
              .eq("id", ts.ticket_id);
          }

          // Insert scan record
          await supabase.from("scans").insert({
            ticket_id: ts.ticket_id,
            event_id: eventId,
            result: "valid",
            scanned_at: scanTime,
            device_info: {
              source: "bulk-mark",
              note: "DZ row 10-17, 13:00-13:20",
            },
            metadata: {},
          });
        }
        results.push(
          `Marked ${dzTicketSeats.length} DZ 10-17 seat tickets (13:00-13:20)`
        );
      }

      // Mark other seat tickets with alternating 11:00 and 14:15
      if (otherTicketSeats.length > 0) {
        const batchSize = 200;
        for (let i = 0; i < otherTicketSeats.length; i += batchSize) {
          const batch = otherTicketSeats.slice(i, i + batchSize);
          const ids = batch.map((ts: any) => ts.id);
          const scanTime =
            i < otherTicketSeats.length / 2 ? scanTime11 : scanTime1415;

          const { error: updateErr } = await supabase
            .from("ticket_seats")
            .update({
              is_scanned: true,
              scanned_at: scanTime,
            })
            .in("id", ids);

          if (updateErr) {
            results.push(
              `Error updating seat tickets batch ${i}: ${updateErr.message}`
            );
          }

          // Update parent tickets too
          const ticketIds = [
            ...new Set(batch.map((ts: any) => ts.ticket_id).filter(Boolean)),
          ];
          if (ticketIds.length > 0) {
            await supabase
              .from("tickets")
              .update({
                status: "used",
                used_at: scanTime,
                scanned_at: scanTime,
                scan_status: "used",
              })
              .in("id", ticketIds);
          }

          // Insert scan records
          const scanRecords = batch
            .filter((ts: any) => ts.ticket_id)
            .map((ts: any) => ({
              ticket_id: ts.ticket_id,
              event_id: eventId,
              result: "valid",
              scanned_at: scanTime,
              device_info: { source: "bulk-mark", note: "post-event marking" },
              metadata: {},
            }));

          if (scanRecords.length > 0) {
            await supabase.from("scans").insert(scanRecords);
          }
        }
        results.push(
          `Marked ${otherTicketSeats.length} other seat tickets as scanned`
        );
      }
    }

    // 6. Also mark any tickets that already had status='used' but no scan record
    const { data: usedNoScan } = await supabase
      .from("tickets")
      .select("id")
      .eq("event_id", eventId)
      .eq("status", "used")
      .is("used_at", null)
      .limit(50000);

    if (usedNoScan && usedNoScan.length > 0) {
      const ids = usedNoScan.map((t: any) => t.id);
      await supabase
        .from("tickets")
        .update({ used_at: scanTime11, scanned_at: scanTime11 })
        .in("id", ids);
      results.push(
        `Fixed ${usedNoScan.length} tickets that were 'used' but had no used_at`
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: results,
        totalTickets: ticketCount,
        totalSeatTickets: seatTicketCount,
        dzSeatsFound: dzSeatIds.size,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message, stack: err.stack }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
