/*
  # Create Seat Order Atomic System

  1. Schema Changes
    - Add `session_id` column to `orders` table for anonymous session tracking
    - Add `notes` column to `orders` table for customer remarks
    - Add `service_fee_amount` column (decimal) for seat order service fees
    - Create `seat_order_seq` sequence for generating unique order numbers

  2. New Functions
    - `create_seat_order_atomic()` - Atomically creates an order from held seats
      - Validates seat holds are still active and not expired
      - Creates order record in orders table with product_type = 'seat'
      - Creates ticket_seats records linking seats to the order
      - Updates seat status from reserved/available to sold
      - Converts seat_holds status from held to converted
      - Returns order_id and order_number on success

  3. Security
    - Function uses SECURITY DEFINER with explicit search_path
    - Granted to both authenticated and anon roles
    - Session-based ownership via session_id column

  4. Important Notes
    - Uses FOR UPDATE row locking on seats to prevent race conditions
    - Validates all held seats belong to the requesting session
    - Generates order numbers in format SN-YYYY-NNNNN
*/

-- Add missing columns to orders table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'session_id' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN session_id text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'notes' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN notes text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'service_fee_amount' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN service_fee_amount decimal(10,2) DEFAULT 0.00;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_session_id ON public.orders (session_id) WHERE session_id IS NOT NULL;

-- Create sequence for seat order numbers
CREATE SEQUENCE IF NOT EXISTS public.seat_order_seq START WITH 1 INCREMENT BY 1;

-- Add RLS policy for session-based order reading
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orders' AND policyname = 'Session owners can read own orders'
  ) THEN
    CREATE POLICY "Session owners can read own orders"
      ON public.orders FOR SELECT TO anon
      USING (session_id IS NOT NULL AND session_id = current_setting('request.headers', true)::json->>'x-session-id');
  END IF;
END $$;

-- Atomic seat order creation function
CREATE OR REPLACE FUNCTION public.create_seat_order_atomic(
  p_event_id UUID,
  p_customer_first_name TEXT,
  p_customer_last_name TEXT,
  p_customer_email TEXT,
  p_customer_phone TEXT DEFAULT NULL,
  p_subtotal DECIMAL DEFAULT 0,
  p_service_fee DECIMAL DEFAULT 0,
  p_total_amount DECIMAL DEFAULT 0,
  p_payment_method TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_seat_ids UUID[] DEFAULT NULL,
  p_seat_prices DECIMAL[] DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
  v_seq_val BIGINT;
  v_year TEXT;
  v_active_count INTEGER;
  v_seat_count INTEGER;
  i INTEGER;
BEGIN
  -- Validate inputs
  IF p_seat_ids IS NULL OR array_length(p_seat_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_seats');
  END IF;

  IF p_seat_prices IS NULL OR array_length(p_seat_prices, 1) != array_length(p_seat_ids, 1) THEN
    RETURN jsonb_build_object('success', false, 'error', 'price_mismatch');
  END IF;

  v_seat_count := array_length(p_seat_ids, 1);

  -- Check holds are still active for this session
  SELECT count(*) INTO v_active_count
  FROM public.seat_holds
  WHERE session_id = p_session_id
    AND event_id = p_event_id
    AND status = 'held'
    AND expires_at > now()
    AND seat_id = ANY(p_seat_ids);

  IF v_active_count < v_seat_count THEN
    RETURN jsonb_build_object('success', false, 'error', 'holds_expired');
  END IF;

  -- Lock the seats with FOR UPDATE
  PERFORM id FROM public.seats
  WHERE id = ANY(p_seat_ids)
  FOR UPDATE;

  -- Generate order number
  v_year := to_char(now(), 'YYYY');
  v_seq_val := nextval('public.seat_order_seq');
  v_order_number := 'SN-' || v_year || '-' || lpad(v_seq_val::text, 5, '0');

  -- Create order
  INSERT INTO public.orders (
    event_id, order_number, payer_name, payer_email, payer_phone,
    total_amount, status, payment_method, product_type,
    session_id, notes, service_fee_amount, metadata
  ) VALUES (
    p_event_id,
    v_order_number,
    p_customer_first_name || ' ' || p_customer_last_name,
    p_customer_email,
    p_customer_phone,
    (p_total_amount * 100)::integer,
    'paid',
    p_payment_method,
    'seat',
    p_session_id,
    p_notes,
    p_service_fee,
    jsonb_build_object(
      'customer_first_name', p_customer_first_name,
      'customer_last_name', p_customer_last_name,
      'subtotal', p_subtotal,
      'service_fee', p_service_fee,
      'seat_count', v_seat_count
    )
  ) RETURNING id INTO v_order_id;

  -- Create ticket_seats records
  FOR i IN 1..v_seat_count LOOP
    INSERT INTO public.ticket_seats (ticket_id, seat_id, event_id, price_paid)
    VALUES (v_order_id, p_seat_ids[i], p_event_id, p_seat_prices[i]);
  END LOOP;

  -- Update seats to sold
  UPDATE public.seats
  SET status = 'sold'
  WHERE id = ANY(p_seat_ids);

  -- Convert holds
  UPDATE public.seat_holds
  SET status = 'converted'
  WHERE session_id = p_session_id
    AND event_id = p_event_id
    AND status = 'held'
    AND seat_id = ANY(p_seat_ids);

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_seat_order_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_seat_order_atomic TO anon;
