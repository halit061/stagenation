/*
  # Complete Table/Guest Tickets Scanner Compatibility Fix

  ## Overview
  This migration ensures table guests and table bookings create real scannable tickets
  in the tickets table, with proper legacy field compatibility for the iPhone scanner.

  ## Changes Made

  1. **Legacy Compat Triggers** 
     - events.title auto-sync from name
     - orders.buyer_* auto-sync from payer_*
     - tickets.qr_code auto-set from qr_data/token/ticket_number
     - tickets.scan_status auto-set

  2. **Table Guest Ticket Type**
     - Creates a "Tafel Gast" ticket type for each event (price=0, unlimited)

  3. **Backfill Existing Data**
     - Fill events.title where NULL
     - Fill orders.buyer_* where NULL
     - Fill tickets.qr_code where NULL
     - Fill tickets.scan_status where NULL

  4. **Scan Lookup View**
     - Creates public.scan_lookup view for scanner compatibility

  ## Security
  - All triggers use SECURITY DEFINER with explicit search_path
  - View has SELECT policy for authenticated users
*/

-- =====================================================
-- PART A: LEGACY COMPAT COLUMNS (verify they exist)
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'title'
  ) THEN
    ALTER TABLE public.events ADD COLUMN title text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'buyer_name'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN buyer_name text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'buyer_email'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN buyer_email text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'buyer_phone'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN buyer_phone text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'qr_code'
  ) THEN
    ALTER TABLE public.tickets ADD COLUMN qr_code text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'scan_status'
  ) THEN
    ALTER TABLE public.tickets ADD COLUMN scan_status text DEFAULT 'valid';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'scanned_at'
  ) THEN
    ALTER TABLE public.tickets ADD COLUMN scanned_at timestamptz;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'scanned_by'
  ) THEN
    ALTER TABLE public.tickets ADD COLUMN scanned_by text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'scanner_name'
  ) THEN
    ALTER TABLE public.tickets ADD COLUMN scanner_name text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'table_guest_id'
  ) THEN
    ALTER TABLE public.tickets ADD COLUMN table_guest_id uuid REFERENCES public.table_guests(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'table_booking_id'
  ) THEN
    ALTER TABLE public.tickets ADD COLUMN table_booking_id uuid REFERENCES public.table_bookings(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'table_guests' AND column_name = 'ticket_id'
  ) THEN
    ALTER TABLE public.table_guests ADD COLUMN ticket_id uuid REFERENCES public.tickets(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'table_guests' AND column_name = 'ticket_number'
  ) THEN
    ALTER TABLE public.table_guests ADD COLUMN ticket_number text;
  END IF;
END $$;

-- =====================================================
-- PART B: TRIGGERS FOR AUTO-SYNC
-- =====================================================

CREATE OR REPLACE FUNCTION sync_events_title()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.title := COALESCE(NEW.title, NEW.name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_events_title ON public.events;
CREATE TRIGGER trg_sync_events_title
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION sync_events_title();

CREATE OR REPLACE FUNCTION sync_orders_buyer_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.buyer_name := COALESCE(NEW.buyer_name, NEW.payer_name);
  NEW.buyer_email := COALESCE(NEW.buyer_email, NEW.payer_email);
  NEW.buyer_phone := COALESCE(NEW.buyer_phone, NEW.payer_phone);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_orders_buyer_fields ON public.orders;
CREATE TRIGGER trg_sync_orders_buyer_fields
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION sync_orders_buyer_fields();

CREATE OR REPLACE FUNCTION sync_tickets_qr_and_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.qr_code IS NULL OR NEW.qr_code = '' THEN
    IF NEW.qr_data IS NOT NULL AND NEW.qr_data <> '' THEN
      NEW.qr_code := NEW.qr_data;
    ELSIF NEW.token IS NOT NULL AND NEW.token <> '' THEN
      NEW.qr_code := NEW.token;
    ELSE
      NEW.qr_code := NEW.ticket_number;
    END IF;
  END IF;

  IF NEW.scan_status IS NULL THEN
    IF NEW.status = 'used' THEN
      NEW.scan_status := 'scanned';
    ELSE
      NEW.scan_status := 'valid';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'used' AND OLD.status <> 'used' THEN
    IF NEW.scanned_at IS NULL THEN
      NEW.scanned_at := NOW();
    END IF;
    NEW.scan_status := 'scanned';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_tickets_qr_and_status ON public.tickets;
CREATE TRIGGER trg_sync_tickets_qr_and_status
  BEFORE INSERT OR UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION sync_tickets_qr_and_status();

-- =====================================================
-- PART C: TABLE GUEST TICKET TYPE (per event)
-- =====================================================

INSERT INTO public.ticket_types (event_id, name, description, price, quantity_total, quantity_sold, is_active)
SELECT 
  e.id,
  'Tafel Gast',
  'Automatisch gegenereerd ticket voor tafel gasten',
  0,
  999999,
  0,
  true
FROM public.events e
WHERE NOT EXISTS (
  SELECT 1 FROM public.ticket_types tt 
  WHERE tt.event_id = e.id AND tt.name = 'Tafel Gast'
);

-- =====================================================
-- PART D: BACKFILL EXISTING DATA
-- =====================================================

UPDATE public.events
SET title = name
WHERE title IS NULL;

UPDATE public.orders
SET 
  buyer_name = COALESCE(buyer_name, payer_name),
  buyer_email = COALESCE(buyer_email, payer_email),
  buyer_phone = COALESCE(buyer_phone, payer_phone)
WHERE buyer_name IS NULL OR buyer_email IS NULL;

UPDATE public.tickets
SET qr_code = CASE
  WHEN qr_data IS NOT NULL AND qr_data <> '' THEN qr_data
  WHEN token IS NOT NULL AND token <> '' THEN token
  ELSE ticket_number
END
WHERE qr_code IS NULL OR qr_code = '';

UPDATE public.tickets
SET scan_status = CASE
  WHEN status = 'used' THEN 'scanned'
  ELSE 'valid'
END
WHERE scan_status IS NULL;

-- =====================================================
-- PART E: SCAN LOOKUP VIEW
-- =====================================================

DROP VIEW IF EXISTS public.scan_lookup;

CREATE VIEW public.scan_lookup AS
SELECT 
  t.id,
  t.ticket_number,
  t.qr_code,
  t.qr_data,
  t.token,
  t.secure_token,
  t.status,
  t.scan_status,
  t.scanned_at,
  t.scanned_by,
  t.scanner_name,
  t.holder_name,
  t.holder_email,
  t.event_id,
  t.order_id,
  t.ticket_type_id,
  t.table_guest_id,
  t.table_booking_id,
  t.product_type,
  t.assigned_table_id,
  t.table_note,
  t.used_at,
  e.name AS event_name,
  e.title AS event_title,
  e.start_date AS event_start_date,
  e.location AS event_location,
  e.is_active AS event_is_active,
  e.scan_open_at,
  e.scan_close_at,
  o.order_number,
  o.payer_name,
  o.payer_email,
  o.buyer_name,
  o.buyer_email,
  o.status AS order_status,
  tt.name AS ticket_type_name,
  ft.table_number,
  ft.table_type,
  ft.capacity AS table_capacity
FROM public.tickets t
LEFT JOIN public.events e ON e.id = t.event_id
LEFT JOIN public.orders o ON o.id = t.order_id
LEFT JOIN public.ticket_types tt ON tt.id = t.ticket_type_id
LEFT JOIN public.floorplan_tables ft ON ft.id = t.assigned_table_id;

GRANT SELECT ON public.scan_lookup TO authenticated;
GRANT SELECT ON public.scan_lookup TO anon;

-- =====================================================
-- PART F: FUNCTION TO CREATE TABLE GUEST TICKET
-- =====================================================

CREATE OR REPLACE FUNCTION create_table_guest_ticket(
  p_event_id uuid,
  p_table_guest_id uuid,
  p_guest_name text,
  p_guest_email text,
  p_assigned_table_id uuid,
  p_number_of_persons integer DEFAULT 1,
  p_table_note text DEFAULT NULL
)
RETURNS TABLE(
  ticket_id uuid,
  ticket_number text,
  qr_code text,
  token text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_type_id uuid;
  v_ticket_id uuid;
  v_ticket_number text;
  v_token text;
  v_qr_code text;
  v_order_id uuid;
BEGIN
  SELECT id INTO v_ticket_type_id
  FROM ticket_types
  WHERE event_id = p_event_id AND name = 'Tafel Gast'
  LIMIT 1;

  IF v_ticket_type_id IS NULL THEN
    INSERT INTO ticket_types (event_id, name, description, price, quantity_total, is_active)
    VALUES (p_event_id, 'Tafel Gast', 'Tafel gast ticket', 0, 999999, true)
    RETURNING id INTO v_ticket_type_id;
  END IF;

  v_ticket_number := 'TABLE-' || EXTRACT(EPOCH FROM NOW())::bigint || '-' || 
                     UPPER(SUBSTRING(MD5(RANDOM()::text) FROM 1 FOR 8));

  v_token := ENCODE(GEN_RANDOM_BYTES(16), 'hex');
  v_qr_code := ENCODE(GEN_RANDOM_BYTES(32), 'hex');

  SELECT id INTO v_order_id
  FROM orders
  WHERE event_id = p_event_id 
    AND order_number LIKE 'GUEST-ORDER-%'
    AND status = 'paid'
  LIMIT 1;

  IF v_order_id IS NULL THEN
    INSERT INTO orders (
      event_id,
      order_number,
      payer_email,
      payer_name,
      total_amount,
      status,
      product_type,
      paid_at
    ) VALUES (
      p_event_id,
      'GUEST-ORDER-' || EXTRACT(EPOCH FROM NOW())::bigint,
      'system@eventgate.app',
      'Table Guest System',
      0,
      'paid',
      'TABLE',
      NOW()
    )
    RETURNING id INTO v_order_id;
  END IF;

  INSERT INTO tickets (
    order_id,
    event_id,
    ticket_type_id,
    ticket_number,
    token,
    qr_data,
    qr_code,
    status,
    scan_status,
    holder_name,
    holder_email,
    product_type,
    assigned_table_id,
    table_note,
    table_guest_id,
    metadata
  ) VALUES (
    v_order_id,
    p_event_id,
    v_ticket_type_id,
    v_ticket_number,
    v_token,
    v_qr_code,
    v_qr_code,
    'valid',
    'valid',
    p_guest_name,
    p_guest_email,
    'TABLE',
    p_assigned_table_id,
    p_table_note,
    p_table_guest_id,
    jsonb_build_object(
      'type', 'table_guest',
      'table_guest_id', p_table_guest_id,
      'number_of_persons', p_number_of_persons
    )
  )
  RETURNING id, tickets.ticket_number, tickets.qr_code, tickets.token
  INTO v_ticket_id, v_ticket_number, v_qr_code, v_token;

  UPDATE table_guests
  SET 
    ticket_id = v_ticket_id,
    ticket_number = v_ticket_number,
    qr_code = v_qr_code
  WHERE id = p_table_guest_id;

  RETURN QUERY SELECT v_ticket_id, v_ticket_number, v_qr_code, v_token;
END;
$$;

-- =====================================================
-- PART G: REPAIR FUNCTION FOR OLD TABLE GUESTS
-- =====================================================

CREATE OR REPLACE FUNCTION repair_table_guest_tickets()
RETURNS TABLE(
  repaired_count integer,
  already_had_ticket integer,
  errors integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_repaired integer := 0;
  v_already integer := 0;
  v_errors integer := 0;
  v_guest RECORD;
  v_result RECORD;
BEGIN
  FOR v_guest IN 
    SELECT 
      tg.id,
      tg.event_id,
      tg.guest_name,
      tg.guest_email,
      tg.assigned_table_id,
      tg.number_of_persons,
      tg.table_note,
      tg.ticket_id,
      tg.qr_code AS old_qr_code
    FROM table_guests tg
    WHERE tg.status IN ('valid', 'used')
  LOOP
    IF v_guest.ticket_id IS NOT NULL THEN
      v_already := v_already + 1;
      CONTINUE;
    END IF;

    BEGIN
      SELECT * INTO v_result
      FROM create_table_guest_ticket(
        v_guest.event_id,
        v_guest.id,
        v_guest.guest_name,
        v_guest.guest_email,
        v_guest.assigned_table_id,
        v_guest.number_of_persons,
        v_guest.table_note
      );

      IF v_result.ticket_id IS NOT NULL THEN
        v_repaired := v_repaired + 1;
      ELSE
        v_errors := v_errors + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      RAISE NOTICE 'Error creating ticket for guest %: %', v_guest.id, SQLERRM;
    END;
  END LOOP;

  RETURN QUERY SELECT v_repaired, v_already, v_errors;
END;
$$;

-- =====================================================
-- PART H: INDEX FOR SCANNER LOOKUPS
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_tickets_qr_code ON public.tickets(qr_code);
CREATE INDEX IF NOT EXISTS idx_tickets_token ON public.tickets(token);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_number ON public.tickets(ticket_number);
CREATE INDEX IF NOT EXISTS idx_tickets_table_guest_id ON public.tickets(table_guest_id);

NOTIFY pgrst, 'reload schema';
