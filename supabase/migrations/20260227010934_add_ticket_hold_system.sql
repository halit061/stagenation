/*
  # Add Ticket Hold / Reservation System

  1. Modified Tables
    - `orders`
      - Add `expires_at` (timestamptz) - when the 10-min hold expires
      - Add `reserved_items` (jsonb) - cart snapshot: [{ticket_type_id, qty}]
      - Add `idempotency_key` (text, unique) - for Mollie duplicate prevention
      - Expand status CHECK to include: reserved, hold_expired, payment_failed, payment_canceled, payment_expired
    - `ticket_types`
      - Add `quantity_reserved` (integer, default 0) - currently held but unpaid

  2. New Tables
    - `checkout_rate_limits` - lightweight rate limiting per IP/user
      - `id` (uuid, primary key)
      - `key` (text) - IP or user identifier
      - `attempts` (integer)
      - `window_start` (timestamptz)
      - `created_at` (timestamptz)

  3. New Indexes
    - `idx_orders_expires_at` on orders(expires_at) for cleanup queries
    - `idx_orders_idempotency_key` unique on orders(idempotency_key)
    - `idx_checkout_rate_limits_key` on checkout_rate_limits(key)

  4. New Functions
    - `reserve_tickets` - atomic reservation with row locking
    - `release_expired_reservations` - cleanup expired holds
    - `check_rate_limit` - IP/user rate limiting

  5. Security
    - Enable RLS on `checkout_rate_limits`
    - Rate limit table only accessible via service role (no public policies)
*/

-- 1. Add columns to orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN expires_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'reserved_items'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN reserved_items jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN idempotency_key text;
  END IF;
END $$;

-- 2. Add quantity_reserved to ticket_types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_types' AND column_name = 'quantity_reserved'
  ) THEN
    ALTER TABLE public.ticket_types ADD COLUMN quantity_reserved integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 3. Expand orders status CHECK constraint to include new statuses
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text, 'paid'::text, 'failed'::text, 'refunded'::text,
    'cancelled'::text, 'comped'::text, 'reserved'::text, 'hold_expired'::text,
    'payment_failed'::text, 'payment_canceled'::text, 'payment_expired'::text
  ]));

-- 4. Add indexes
CREATE INDEX IF NOT EXISTS idx_orders_expires_at
  ON public.orders (expires_at)
  WHERE expires_at IS NOT NULL AND status = 'reserved';

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key
  ON public.orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 5. Create rate limit table
CREATE TABLE IF NOT EXISTS public.checkout_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  attempts integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.checkout_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_checkout_rate_limits_key
  ON public.checkout_rate_limits (key);

-- 6. reserve_tickets RPC
-- Atomically checks availability, creates a reserved order, and decrements available stock
CREATE OR REPLACE FUNCTION public.reserve_tickets(
  p_event_id uuid,
  p_items jsonb,           -- array of {ticket_type_id, quantity, price}
  p_customer_email text,
  p_customer_name text,
  p_customer_phone text DEFAULT '',
  p_hold_minutes integer DEFAULT 10,
  p_idempotency_key text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_tt_id uuid;
  v_qty integer;
  v_available integer;
  v_total_qty integer := 0;
  v_order_id uuid;
  v_order_number text;
  v_expires_at timestamptz;
  v_existing_order_id uuid;
BEGIN
  -- Check idempotency: if an order with this key already exists and is still valid, return it
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_order_id
    FROM public.orders
    WHERE idempotency_key = p_idempotency_key
      AND status IN ('reserved', 'pending', 'paid')
    LIMIT 1;

    IF v_existing_order_id IS NOT NULL THEN
      SELECT jsonb_build_object(
        'order_id', o.id,
        'order_number', o.order_number,
        'expires_at', o.expires_at,
        'status', o.status,
        'already_exists', true
      ) INTO v_item
      FROM public.orders o WHERE o.id = v_existing_order_id;
      RETURN v_item;
    END IF;
  END IF;

  -- Lock and validate each ticket type
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_tt_id := (v_item->>'ticket_type_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    v_total_qty := v_total_qty + v_qty;

    -- Row-level lock on ticket_type to prevent race conditions
    SELECT (tt.quantity_total - tt.quantity_sold - tt.quantity_reserved)
    INTO v_available
    FROM public.ticket_types tt
    WHERE tt.id = v_tt_id AND tt.event_id = p_event_id
    FOR UPDATE;

    IF v_available IS NULL THEN
      RAISE EXCEPTION 'Ticket type not found: %', v_tt_id;
    END IF;

    IF v_available < v_qty THEN
      RAISE EXCEPTION 'Not enough tickets available for type %. Requested: %, Available: %', v_tt_id, v_qty, v_available;
    END IF;

    -- Reserve the stock
    UPDATE public.ticket_types
    SET quantity_reserved = quantity_reserved + v_qty
    WHERE id = v_tt_id;
  END LOOP;

  -- Create the reserved order
  v_order_number := 'TKT-' || floor(extract(epoch from now()) * 1000)::text
                     || '-' || upper(substr(md5(random()::text), 1, 9));
  v_expires_at := now() + (p_hold_minutes || ' minutes')::interval;

  INSERT INTO public.orders (
    event_id, order_number, payer_email, payer_name, payer_phone,
    total_amount, status, payment_provider, expires_at, reserved_items,
    idempotency_key, metadata
  ) VALUES (
    p_event_id, v_order_number, p_customer_email, p_customer_name, p_customer_phone,
    0, 'reserved', 'mollie', v_expires_at, p_items,
    p_idempotency_key, p_metadata
  )
  RETURNING id INTO v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'expires_at', v_expires_at,
    'total_qty', v_total_qty,
    'already_exists', false
  );
END;
$$;

-- 7. release_expired_reservations RPC
-- Releases stock for orders that have expired their hold window
CREATE OR REPLACE FUNCTION public.release_expired_reservations(
  p_event_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_item jsonb;
  v_released_count integer := 0;
BEGIN
  FOR v_order IN
    SELECT id, reserved_items, event_id
    FROM public.orders
    WHERE status = 'reserved'
      AND expires_at IS NOT NULL
      AND expires_at < now()
      AND (p_event_id IS NULL OR event_id = p_event_id)
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Release each reserved ticket type
    IF v_order.reserved_items IS NOT NULL THEN
      FOR v_item IN SELECT * FROM jsonb_array_elements(v_order.reserved_items)
      LOOP
        UPDATE public.ticket_types
        SET quantity_reserved = GREATEST(0, quantity_reserved - (v_item->>'quantity')::integer)
        WHERE id = (v_item->>'ticket_type_id')::uuid
          AND event_id = v_order.event_id;
      END LOOP;
    END IF;

    -- Mark order as expired
    UPDATE public.orders
    SET status = 'hold_expired', updated_at = now()
    WHERE id = v_order.id;

    -- Revoke any pending tickets for this order
    UPDATE public.tickets
    SET status = 'revoked',
        revoked_reason = 'Hold expired',
        revoked_at = now()
    WHERE order_id = v_order.id AND status = 'pending';

    v_released_count := v_released_count + 1;
  END LOOP;

  RETURN jsonb_build_object('released_orders', v_released_count);
END;
$$;

-- 8. check_rate_limit RPC
-- Returns whether the request should be allowed or blocked
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_max_attempts integer DEFAULT 5,
  p_window_seconds integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
  v_attempts integer;
  v_allowed boolean;
BEGIN
  v_window_start := now() - (p_window_seconds || ' seconds')::interval;

  -- Clean up old entries
  DELETE FROM public.checkout_rate_limits
  WHERE window_start < v_window_start;

  -- Get current count
  SELECT attempts INTO v_attempts
  FROM public.checkout_rate_limits
  WHERE key = p_key AND window_start >= v_window_start
  ORDER BY window_start DESC
  LIMIT 1;

  IF v_attempts IS NULL THEN
    -- First attempt in window
    INSERT INTO public.checkout_rate_limits (key, attempts, window_start)
    VALUES (p_key, 1, now());
    v_allowed := true;
  ELSIF v_attempts < p_max_attempts THEN
    -- Increment
    UPDATE public.checkout_rate_limits
    SET attempts = attempts + 1
    WHERE key = p_key AND window_start >= v_window_start;
    v_allowed := true;
  ELSE
    v_allowed := false;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'attempts', COALESCE(v_attempts, 0) + 1,
    'max_attempts', p_max_attempts,
    'retry_after_seconds', p_window_seconds
  );
END;
$$;
