import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyQrSignature } from "../_shared/qr-sign.ts";

interface ScanRequest {
  code: string;
  scanner_user_id?: string;
  active_event_id?: string;
  device_info?: any;
}

interface ScanResult {
  status: string;
  type?: 'ticket' | 'guest_ticket' | 'table_guest';
  item_id?: string;
  event_id?: string;
  used_at?: string;
  scanned_at?: string;
  message?: string;
  details?: {
    holder_name?: string;
    ticket_number?: string;
    ticket_code?: string;
    event_name?: string;
    section_name?: string;
    row_label?: string;
    seat_number?: number;
    guest_name?: string;
    table_number?: string;
    table_name?: string;
    number_of_persons?: number;
  };
}

const SCAN_RATE_LIMIT_MAX = 60;
const SCAN_RATE_LIMIT_WINDOW = 60;

function getClientIp(req: Request): string {
  // SECURITY: Check trusted proxy headers first (cf-connecting-ip cannot be spoofed by clients)
  return req.headers.get("cf-connecting-ip")
    || req.headers.get("x-real-ip")
    || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
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

    // SECURITY: Authenticate scanner/admin user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ status: "AUTH_ERROR", message: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Allow anon key for scanner app (scanner_user_id is passed in body for identification)
    // but still require valid JWT for non-anon calls
    if (token !== supabaseAnonKey) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(
          JSON.stringify({ status: "AUTH_ERROR", message: "Invalid or expired token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify user has scanner, admin, or super_admin role
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("is_active", true);

      const hasPermission = roles?.some(
        (r: { role: string }) =>
          r.role === "scanner" || r.role === "admin" || r.role === "super_admin" || r.role === "superadmin"
      );

      if (!hasPermission) {
        return new Response(
          JSON.stringify({ status: "AUTH_ERROR", message: "Insufficient permissions" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const clientIp = getClientIp(req);
    const { data: rateResult } = await supabase.rpc("check_rate_limit", {
      p_key: `scan:${clientIp}`,
      p_max_attempts: SCAN_RATE_LIMIT_MAX,
      p_window_seconds: SCAN_RATE_LIMIT_WINDOW,
    });

    if (rateResult && !rateResult.allowed) {
      return new Response(
        JSON.stringify({
          status: "RATE_LIMITED",
          message: "Too many scan attempts. Please wait.",
          retry_after_seconds: rateResult.retry_after_seconds,
        }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rateResult.retry_after_seconds) },
        }
      );
    }

    let requestBody: ScanRequest;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      return new Response(
        JSON.stringify({ status: "INVALID", message: "Invalid request" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { code, scanner_user_id, active_event_id, device_info } = requestBody;

    if (!code || typeof code !== "string" || code.trim() === "") {
      return new Response(
        JSON.stringify({ status: "INVALID", message: "Code is required" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // HMAC verification for signed QR payloads (v2+)
    try {
      const parsed = JSON.parse(code);
      if (parsed && typeof parsed === "object" && parsed.v >= 2 && parsed.sig) {
        const isValid = await verifyQrSignature(parsed);
        if (!isValid) {
          console.warn("HMAC verification failed for QR payload:", code.substring(0, 80));
          return new Response(
            JSON.stringify({ status: "INVALID", message: "QR code signature invalid" }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }
    } catch {
      // Not JSON — regular ticket code, proceed normally
    }

    // Try 1: Regular ticket (by ticket_number, token, or secure_token)
    const ticketResult = await scanRegularTicket(supabase, code, active_event_id, scanner_user_id, device_info);
    if (ticketResult) {
      return new Response(JSON.stringify(ticketResult), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try 2: Guest ticket QR (multi-person guest tickets)
    const guestTicketQrResult = await scanGuestTicketQr(supabase, code, active_event_id, scanner_user_id);
    if (guestTicketQrResult) {
      return new Response(JSON.stringify(guestTicketQrResult), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try 3: Legacy guest ticket (by qr_code)
    const guestTicketResult = await scanGuestTicket(supabase, code, active_event_id, scanner_user_id);
    if (guestTicketResult) {
      return new Response(JSON.stringify(guestTicketResult), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try 4: Table guest (by qr_code)
    const tableGuestResult = await scanTableGuest(supabase, code, active_event_id, scanner_user_id);
    if (tableGuestResult) {
      return new Response(JSON.stringify(tableGuestResult), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Nothing found
    return new Response(
      JSON.stringify({ status: "INVALID", message: "Code not found" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Unified scan error:", error);
    return new Response(
      JSON.stringify({ status: "ERROR", message: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function scanRegularTicket(
  supabase: any,
  code: string,
  active_event_id?: string,
  scanner_user_id?: string,
  device_info?: any
): Promise<ScanResult | null> {
  let ticket = null;

  const ticketSelect = `
    id,
    order_id,
    event_id,
    ticket_number,
    token,
    secure_token,
    qr_code,
    qr_data,
    status,
    used_at,
    holder_name,
    table_guest_id,
    table_booking_id,
    assigned_table_id,
    product_type,
    events (id, name, scan_open_at, scan_close_at, is_active),
    ticket_types (name),
    floorplan_tables:assigned_table_id (table_number, table_type, capacity)
  `;

  const { data: ticketByQrCode } = await supabase
    .from("tickets")
    .select(ticketSelect)
    .eq("qr_code", code)
    .maybeSingle();

  if (ticketByQrCode) {
    ticket = ticketByQrCode;
  }

  if (!ticket) {
    const { data: ticketByNumber } = await supabase
      .from("tickets")
      .select(ticketSelect)
      .eq("ticket_number", code)
      .maybeSingle();

    if (ticketByNumber) {
      ticket = ticketByNumber;
    }
  }

  if (!ticket) {
    const { data: ticketByToken } = await supabase
      .from("tickets")
      .select(ticketSelect)
      .eq("token", code)
      .maybeSingle();

    if (ticketByToken) {
      ticket = ticketByToken;
    }
  }

  if (!ticket) {
    const { data: ticketByQrData } = await supabase
      .from("tickets")
      .select(ticketSelect)
      .eq("qr_data", code)
      .maybeSingle();

    if (ticketByQrData) {
      ticket = ticketByQrData;
    }
  }

  if (!ticket) {
    const { data: ticketBySecureToken } = await supabase
      .from("tickets")
      .select(ticketSelect)
      .eq("secure_token", code)
      .maybeSingle();

    if (ticketBySecureToken) {
      ticket = ticketBySecureToken;
    }
  }

  if (!ticket) {
    return null; // Not a regular ticket
  }

  // Check event match
  if (active_event_id && ticket.event_id !== active_event_id) {
    return {
      status: "WRONG_EVENT",
      type: "ticket",
      item_id: ticket.id,
      event_id: ticket.event_id,
      message: "Ticket is for a different event",
    };
  }

  // Check if event exists
  if (!ticket.events) {
    return {
      status: "INVALID",
      type: "ticket",
      message: "Event not found",
    };
  }

  // Check if event is active
  if (!ticket.events.is_active) {
    return {
      status: "EVENT_CLOSED",
      type: "ticket",
      message: "Event is not active",
    };
  }

  // Check scan window
  const now = new Date();
  if (ticket.events.scan_open_at) {
    const scanOpenAt = new Date(ticket.events.scan_open_at);
    if (now < scanOpenAt) {
      return {
        status: "NOT_YET_OPEN",
        type: "ticket",
        message: "Scanning not yet open for this event",
      };
    }
  }

  if (ticket.events.scan_close_at) {
    const scanCloseAt = new Date(ticket.events.scan_close_at);
    if (now > scanCloseAt) {
      return {
        status: "EVENT_CLOSED",
        type: "ticket",
        message: "Scanning has closed for this event",
      };
    }
  }

  const isTableTicket = ticket.product_type === 'TABLE' || ticket.table_guest_id || ticket.table_booking_id;

  let seatInfo: { ticket_code?: string; section_name?: string; row_label?: string; seat_number?: number } = {};
  try {
    const { data: tsRow } = await supabase
      .from("ticket_seats")
      .select("ticket_code, seats!inner(row_label, seat_number, seat_sections(name))")
      .eq("ticket_id", ticket.id)
      .limit(1)
      .maybeSingle();
    if (tsRow) {
      seatInfo = {
        ticket_code: tsRow.ticket_code || undefined,
        section_name: tsRow.seats?.seat_sections?.name || undefined,
        row_label: tsRow.seats?.row_label || undefined,
        seat_number: tsRow.seats?.seat_number || undefined,
      };
    }
  } catch {}

  if (ticket.status === "used") {
    return {
      status: "ALREADY_USED",
      type: isTableTicket ? "table_ticket" : "ticket",
      item_id: ticket.id,
      event_id: ticket.event_id,
      used_at: ticket.used_at,
      message: isTableTicket ? "Table ticket already scanned" : "Ticket already scanned",
      details: {
        holder_name: ticket.holder_name,
        ticket_number: ticket.ticket_number,
        event_name: ticket.events.name,
        table_number: ticket.floorplan_tables?.table_number,
        table_type: ticket.floorplan_tables?.table_type,
        ...seatInfo,
      },
    };
  }

  if (ticket.status === "valid") {
    const usedAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("tickets")
      .update({
        status: "used",
        used_at: usedAt,
      })
      .eq("id", ticket.id)
      .eq("status", "valid");

    if (updateError) {
      console.error("Failed to update ticket status:", updateError);
      return {
        status: "ERROR",
        type: "ticket",
        message: "Failed to mark ticket as used",
      };
    }

    await supabase.from("scans").insert({
      ticket_id: ticket.id,
      scanner_id: scanner_user_id || null,
      event_id: ticket.event_id,
      result: "valid",
      device_info: device_info || {},
    });

    const isTableTicket = ticket.product_type === 'TABLE' || ticket.table_guest_id || ticket.table_booking_id;

    return {
      status: "OK",
      type: isTableTicket ? "table_ticket" : "ticket",
      item_id: ticket.id,
      event_id: ticket.event_id,
      used_at: usedAt,
      message: isTableTicket ? "Table ticket scanned successfully" : "Ticket scanned successfully",
      details: {
        holder_name: ticket.holder_name,
        ticket_number: ticket.ticket_number,
        event_name: ticket.events.name,
        table_number: ticket.floorplan_tables?.table_number,
        table_type: ticket.floorplan_tables?.table_type,
        ...seatInfo,
      },
    };
  }

  // Invalid status
  return {
    status: "INVALID",
    type: "ticket",
    message: `Invalid ticket status: ${ticket.status}`,
  };
}

async function scanGuestTicketQr(
  supabase: any,
  code: string,
  active_event_id?: string,
  scanner_user_id?: string
): Promise<ScanResult | null> {
  const { data: guestQr } = await supabase
    .from("guest_ticket_qrs")
    .select(`
      id,
      event_id,
      order_id,
      person_index,
      name,
      qr_token,
      used_at,
      used_by_scanner_id,
      orders!inner (
        id,
        payer_name,
        payer_email,
        persons_count
      ),
      events (id, name, scan_open_at, scan_close_at, is_active)
    `)
    .eq("qr_token", code)
    .maybeSingle();

  if (!guestQr) {
    return null;
  }


  if (active_event_id && guestQr.event_id !== active_event_id) {
    return {
      status: "WRONG_EVENT",
      type: "guest_ticket",
      item_id: guestQr.id,
      event_id: guestQr.event_id,
      message: "Guest ticket is for a different event",
    };
  }

  if (!guestQr.events) {
    return {
      status: "INVALID",
      type: "guest_ticket",
      message: "Event not found",
    };
  }

  if (!guestQr.events.is_active) {
    return {
      status: "EVENT_CLOSED",
      type: "guest_ticket",
      message: "Event is not active",
    };
  }

  const now = new Date();
  if (guestQr.events.scan_open_at) {
    const scanOpenAt = new Date(guestQr.events.scan_open_at);
    if (now < scanOpenAt) {
      return {
        status: "NOT_YET_OPEN",
        type: "guest_ticket",
        message: "Scanning not yet open for this event",
      };
    }
  }

  if (guestQr.events.scan_close_at) {
    const scanCloseAt = new Date(guestQr.events.scan_close_at);
    if (now > scanCloseAt) {
      return {
        status: "EVENT_CLOSED",
        type: "guest_ticket",
        message: "Scanning has closed for this event",
      };
    }
  }

  if (guestQr.used_at) {
    return {
      status: "ALREADY_USED",
      type: "guest_ticket",
      item_id: guestQr.id,
      event_id: guestQr.event_id,
      used_at: guestQr.used_at,
      message: "Guest ticket already scanned",
      details: {
        guest_name: guestQr.name || guestQr.orders?.payer_name,
        event_name: guestQr.events.name,
        number_of_persons: 1,
      },
    };
  }

  const usedAt = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("guest_ticket_qrs")
    .update({
      used_at: usedAt,
      used_by_scanner_id: scanner_user_id || null,
    })
    .eq("id", guestQr.id)
    .is("used_at", null);

  if (updateError) {
    console.error("Failed to update guest ticket QR status:", updateError);
    return {
      status: "ERROR",
      type: "guest_ticket",
      message: "Failed to mark guest ticket as used",
    };
  }


  const totalPersons = guestQr.orders?.persons_count || 1;
  const personLabel = totalPersons > 1 ? ` (${guestQr.person_index}/${totalPersons})` : '';

  return {
    status: "OK",
    type: "guest_ticket",
    item_id: guestQr.id,
    event_id: guestQr.event_id,
    scanned_at: usedAt,
    message: `Guest ticket scanned successfully${personLabel}`,
    details: {
      guest_name: guestQr.name || guestQr.orders?.payer_name,
      event_name: guestQr.events.name,
      number_of_persons: 1,
    },
  };
}

async function scanGuestTicket(
  supabase: any,
  code: string,
  active_event_id?: string,
  scanner_user_id?: string
): Promise<ScanResult | null> {
  const { data: guestTicket } = await supabase
    .from("guest_tickets")
    .select(`
      id,
      event_id,
      recipient_name,
      recipient_email,
      qr_code,
      status,
      scanned_at,
      events (id, name, scan_open_at, scan_close_at, is_active)
    `)
    .eq("qr_code", code)
    .maybeSingle();

  if (!guestTicket) {
    return null; // Not a guest ticket
  }


  // Check event match
  if (active_event_id && guestTicket.event_id !== active_event_id) {
    return {
      status: "WRONG_EVENT",
      type: "guest_ticket",
      item_id: guestTicket.id,
      event_id: guestTicket.event_id,
      message: "Guest ticket is for a different event",
    };
  }

  // Check if event exists
  if (!guestTicket.events) {
    return {
      status: "INVALID",
      type: "guest_ticket",
      message: "Event not found",
    };
  }

  // Check if event is active
  if (!guestTicket.events.is_active) {
    return {
      status: "EVENT_CLOSED",
      type: "guest_ticket",
      message: "Event is not active",
    };
  }

  // Check scan window
  const now = new Date();
  if (guestTicket.events.scan_open_at) {
    const scanOpenAt = new Date(guestTicket.events.scan_open_at);
    if (now < scanOpenAt) {
      return {
        status: "NOT_YET_OPEN",
        type: "guest_ticket",
        message: "Scanning not yet open for this event",
      };
    }
  }

  if (guestTicket.events.scan_close_at) {
    const scanCloseAt = new Date(guestTicket.events.scan_close_at);
    if (now > scanCloseAt) {
      return {
        status: "EVENT_CLOSED",
        type: "guest_ticket",
        message: "Scanning has closed for this event",
      };
    }
  }

  // Check status
  if (guestTicket.status === "used") {
    return {
      status: "ALREADY_USED",
      type: "guest_ticket",
      item_id: guestTicket.id,
      event_id: guestTicket.event_id,
      scanned_at: guestTicket.scanned_at,
      message: "Guest ticket already scanned",
      details: {
        guest_name: guestTicket.recipient_name,
        event_name: guestTicket.events.name,
      },
    };
  }

  if (guestTicket.status === "cancelled") {
    return {
      status: "INVALID",
      type: "guest_ticket",
      message: "Guest ticket has been cancelled",
    };
  }

  if (guestTicket.status === "valid") {
    const scannedAt = new Date().toISOString();

    // Mark as used
    const { error: updateError } = await supabase
      .from("guest_tickets")
      .update({
        status: "used",
        scanned_at: scannedAt,
      })
      .eq("id", guestTicket.id)
      .eq("status", "valid");

    if (updateError) {
      console.error("Failed to update guest ticket status:", updateError);
      return {
        status: "ERROR",
        type: "guest_ticket",
        message: "Failed to mark guest ticket as used",
      };
    }


    return {
      status: "OK",
      type: "guest_ticket",
      item_id: guestTicket.id,
      event_id: guestTicket.event_id,
      scanned_at: scannedAt,
      message: "Guest ticket scanned successfully",
      details: {
        guest_name: guestTicket.recipient_name,
        event_name: guestTicket.events.name,
      },
    };
  }

  // Invalid status
  return {
    status: "INVALID",
    type: "guest_ticket",
    message: `Invalid guest ticket status: ${guestTicket.status}`,
  };
}

async function scanTableGuest(
  supabase: any,
  code: string,
  active_event_id?: string,
  scanner_user_id?: string
): Promise<ScanResult | null> {
  const { data: tableGuest } = await supabase
    .from("table_guests")
    .select(`
      id,
      event_id,
      guest_name,
      guest_email,
      number_of_persons,
      qr_code,
      status,
      scanned_at,
      assigned_table_id,
      floorplan_tables:assigned_table_id (table_number, table_name, capacity),
      events (id, name, scan_open_at, scan_close_at, is_active)
    `)
    .eq("qr_code", code)
    .maybeSingle();

  if (!tableGuest) {
    return null; // Not a table guest
  }


  // Check event match
  if (active_event_id && tableGuest.event_id !== active_event_id) {
    return {
      status: "WRONG_EVENT",
      type: "table_guest",
      item_id: tableGuest.id,
      event_id: tableGuest.event_id,
      message: "Table guest is for a different event",
    };
  }

  // Check if event exists
  if (!tableGuest.events) {
    return {
      status: "INVALID",
      type: "table_guest",
      message: "Event not found",
    };
  }

  // Check if event is active
  if (!tableGuest.events.is_active) {
    return {
      status: "EVENT_CLOSED",
      type: "table_guest",
      message: "Event is not active",
    };
  }

  // Check scan window
  const now = new Date();
  if (tableGuest.events.scan_open_at) {
    const scanOpenAt = new Date(tableGuest.events.scan_open_at);
    if (now < scanOpenAt) {
      return {
        status: "NOT_YET_OPEN",
        type: "table_guest",
        message: "Scanning not yet open for this event",
      };
    }
  }

  if (tableGuest.events.scan_close_at) {
    const scanCloseAt = new Date(tableGuest.events.scan_close_at);
    if (now > scanCloseAt) {
      return {
        status: "EVENT_CLOSED",
        type: "table_guest",
        message: "Scanning has closed for this event",
      };
    }
  }

  // Check status
  if (tableGuest.status === "used") {
    return {
      status: "ALREADY_USED",
      type: "table_guest",
      item_id: tableGuest.id,
      event_id: tableGuest.event_id,
      scanned_at: tableGuest.scanned_at,
      message: "Table guest already checked in",
      details: {
        guest_name: tableGuest.guest_name,
        table_number: tableGuest.floorplan_tables?.table_number,
        table_name: tableGuest.floorplan_tables?.table_name,
        number_of_persons: tableGuest.number_of_persons,
        event_name: tableGuest.events.name,
      },
    };
  }

  if (tableGuest.status === "cancelled") {
    return {
      status: "INVALID",
      type: "table_guest",
      message: "Table guest has been cancelled",
    };
  }

  if (tableGuest.status === "valid") {
    const scannedAt = new Date().toISOString();

    // Mark as used
    const { error: updateError } = await supabase
      .from("table_guests")
      .update({
        status: "used",
        scanned_at: scannedAt,
      })
      .eq("id", tableGuest.id)
      .eq("status", "valid");

    if (updateError) {
      console.error("Failed to update table guest status:", updateError);
      return {
        status: "ERROR",
        type: "table_guest",
        message: "Failed to mark table guest as checked in",
      };
    }


    return {
      status: "OK",
      type: "table_guest",
      item_id: tableGuest.id,
      event_id: tableGuest.event_id,
      scanned_at: scannedAt,
      message: "Table guest checked in successfully",
      details: {
        guest_name: tableGuest.guest_name,
        table_number: tableGuest.floorplan_tables?.table_number,
        table_name: tableGuest.floorplan_tables?.table_name,
        number_of_persons: tableGuest.number_of_persons,
        event_name: tableGuest.events.name,
      },
    };
  }

  // Invalid status
  return {
    status: "INVALID",
    type: "table_guest",
    message: `Invalid table guest status: ${tableGuest.status}`,
  };
}
