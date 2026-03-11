-- ============================================================
-- Security Fixes Migration
-- 1. Restrict webhook_logs INSERT to service_role only
-- 2. Add atomic stock rollback RPC for webhook failed payments
-- 3. Add table reservation locking to prevent race conditions
-- ============================================================

-- 1. Fix webhook_logs: Remove overly permissive public INSERT policy
DO $$
BEGIN
  -- Drop existing permissive INSERT policies on webhook_logs
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'webhook_logs' AND policyname = 'Webhooks can insert logs') THEN
    DROP POLICY "Webhooks can insert logs" ON webhook_logs;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'webhook_logs' AND policyname = 'webhook_logs_insert_policy') THEN
    DROP POLICY "webhook_logs_insert_policy" ON webhook_logs;
  END IF;
END $$;

-- Only service_role (used by edge functions) can insert webhook logs
-- No public/anon access needed since webhooks go through edge functions
-- Note: service_role bypasses RLS entirely, so no explicit policy needed for it.
-- We just ensure no public INSERT policy exists.

-- 2. Atomic stock rollback RPC for webhook failed payment processing
-- Replaces the read-then-write pattern that has race conditions
CREATE OR REPLACE FUNCTION atomic_rollback_ticket_stock(
  p_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_type_id uuid;
  v_count integer;
BEGIN
  -- Count tickets per type for this order and atomically decrement quantity_sold
  FOR v_ticket_type_id, v_count IN
    SELECT ticket_type_id, COUNT(*)::integer
    FROM tickets
    WHERE order_id = p_order_id
      AND ticket_type_id IS NOT NULL
    GROUP BY ticket_type_id
  LOOP
    UPDATE ticket_types
    SET quantity_sold = GREATEST(0, COALESCE(quantity_sold, 0) - v_count)
    WHERE id = v_ticket_type_id;
  END LOOP;
END;
$$;

-- 3. Table reservation atomic lock function
-- Prevents race condition where two users book the same table simultaneously
CREATE OR REPLACE FUNCTION atomic_reserve_table(
  p_event_id uuid,
  p_floorplan_table_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_number_of_guests integer,
  p_special_requests text DEFAULT '',
  p_booking_code text DEFAULT NULL,
  p_total_price numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id uuid;
  v_existing_id uuid;
  v_table_price numeric;
BEGIN
  -- Lock the floorplan table row to prevent concurrent bookings
  SELECT id, price INTO v_existing_id, v_table_price
  FROM floorplan_tables
  WHERE id = p_floorplan_table_id
  FOR UPDATE;

  IF v_existing_id IS NULL THEN
    RAISE EXCEPTION 'Table not found';
  END IF;

  -- Check if table is already booked (PAID or PENDING with order_id)
  SELECT id INTO v_existing_id
  FROM table_bookings
  WHERE floorplan_table_id = p_floorplan_table_id
    AND event_id = p_event_id
    AND (status = 'PAID' OR (status = 'PENDING' AND order_id IS NOT NULL))
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'TABLE_ALREADY_BOOKED: This table is already reserved';
  END IF;

  -- Use server-side price from floorplan_tables, ignore client-supplied price
  INSERT INTO table_bookings (
    event_id, floorplan_table_id, customer_name, customer_email,
    customer_phone, number_of_guests, special_requests,
    total_price, status, booking_code
  ) VALUES (
    p_event_id, p_floorplan_table_id, p_customer_name, p_customer_email,
    p_customer_phone, p_number_of_guests, p_special_requests,
    v_table_price, 'PENDING', p_booking_code
  )
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$$;

-- 4. Add rate limiting for contact form submissions
CREATE OR REPLACE FUNCTION check_contact_rate_limit(
  p_email text,
  p_ip text DEFAULT 'unknown'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent_count integer;
BEGIN
  -- Max 3 contact messages per email per hour
  SELECT COUNT(*) INTO v_recent_count
  FROM contact_messages
  WHERE email = p_email
    AND created_at > NOW() - INTERVAL '1 hour';

  RETURN v_recent_count < 3;
END;
$$;
