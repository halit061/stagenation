/*
  # Create missing RPC functions

  ## Problem
  Multiple edge functions call RPCs that don't exist, causing silent failures
  in core flows like ticket checkout, rate limiting, drink orders, etc.

  ## Missing RPCs
  - check_rate_limit - rate limiting for checkout/scan/validate endpoints
  - grant_super_admin - grants super_admin role to a user
  - atomic_decrement_ticket_stock - atomically decrements ticket quantity_sold
  - atomic_rollback_ticket_stock - rolls back quantity_sold on failure
  - rollback_ticket_stock - alias/wrapper for rollback
  - convert_reservation_to_sold - converts reserved tickets to sold
  - release_expired_reservations - releases expired ticket reservations
  - reserve_tickets - reserves tickets for a time window
  - increment_promo_usage - increments promo code used_count
  - deduct_drink_stock - decrements drink stock
  - generate_drink_order_display_code - generates unique 6-char code
  - mark_drink_order_delivered - marks drink order as delivered
  - list_user_roles_with_email - lists user roles with auth email
*/

-- check_rate_limit: simple in-memory rate limiting using a tracking table
-- Returns {allowed: boolean, retry_after_seconds: number}
CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_rate_limit_log_key_created ON public.rate_limit_log(key, created_at);

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_max_attempts integer DEFAULT 60,
  p_window_seconds integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_window_start timestamptz;
BEGIN
  v_window_start := now() - (p_window_seconds || ' seconds')::interval;

  -- Clean old entries
  DELETE FROM public.rate_limit_log
  WHERE key = p_key AND created_at < v_window_start;

  -- Count current window
  SELECT COUNT(*) INTO v_count
  FROM public.rate_limit_log
  WHERE key = p_key AND created_at >= v_window_start;

  IF v_count >= p_max_attempts THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', p_window_seconds,
      'current_count', v_count
    );
  END IF;

  -- Record this attempt
  INSERT INTO public.rate_limit_log (key) VALUES (p_key);

  RETURN jsonb_build_object(
    'allowed', true,
    'retry_after_seconds', 0,
    'current_count', v_count + 1
  );
END;
$$;

-- grant_super_admin: grants super_admin role to a user by email
CREATE OR REPLACE FUNCTION public.grant_super_admin(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Find user by email in auth.users
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  -- Upsert super_admin role
  INSERT INTO public.user_roles (user_id, role, is_active)
  VALUES (v_user_id, 'super_admin', true)
  ON CONFLICT (user_id, role) DO UPDATE
    SET is_active = true, updated_at = now();

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id);
END;
$$;

-- Add unique constraint to user_roles if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_roles'::regclass
    AND contype = 'u'
    AND conname = 'user_roles_user_id_role_key'
  ) THEN
    ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- atomic_decrement_ticket_stock: atomically increment quantity_sold
-- p_items: [{ticket_type_id, quantity}]
CREATE OR REPLACE FUNCTION public.atomic_decrement_ticket_stock(
  p_event_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_ticket_type record;
  v_available integer;
BEGIN
  -- Validate all items first
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT id, quantity_total, quantity_sold, quantity_reserved, is_active
    INTO v_ticket_type
    FROM public.ticket_types
    WHERE id = (v_item->>'ticket_type_id')::uuid
      AND event_id = p_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ticket type not found: ' || (v_item->>'ticket_type_id'));
    END IF;

    IF NOT v_ticket_type.is_active THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ticket type not active');
    END IF;

    v_available := v_ticket_type.quantity_total - v_ticket_type.quantity_sold - COALESCE(v_ticket_type.quantity_reserved, 0);

    IF v_available < (v_item->>'quantity')::integer THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Insufficient stock',
        'available', v_available,
        'requested', (v_item->>'quantity')::integer
      );
    END IF;
  END LOOP;

  -- Apply all decrements
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE public.ticket_types
    SET quantity_sold = quantity_sold + (v_item->>'quantity')::integer,
        updated_at = now()
    WHERE id = (v_item->>'ticket_type_id')::uuid;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- atomic_rollback_ticket_stock: rolls back quantity_sold
CREATE OR REPLACE FUNCTION public.atomic_rollback_ticket_stock(
  p_event_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE public.ticket_types
    SET quantity_sold = GREATEST(0, quantity_sold - (v_item->>'quantity')::integer),
        updated_at = now()
    WHERE id = (v_item->>'ticket_type_id')::uuid
      AND event_id = p_event_id;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- rollback_ticket_stock: alias for atomic_rollback_ticket_stock
CREATE OR REPLACE FUNCTION public.rollback_ticket_stock(
  p_event_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.atomic_rollback_ticket_stock(p_event_id, p_items);
END;
$$;

-- reserve_tickets: reserve tickets (increment quantity_reserved)
CREATE OR REPLACE FUNCTION public.reserve_tickets(
  p_event_id uuid,
  p_items jsonb,
  p_order_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_ticket_type record;
  v_available integer;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT id, quantity_total, quantity_sold, quantity_reserved, is_active
    INTO v_ticket_type
    FROM public.ticket_types
    WHERE id = (v_item->>'ticket_type_id')::uuid
      AND event_id = p_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ticket type not found');
    END IF;

    v_available := v_ticket_type.quantity_total - v_ticket_type.quantity_sold - COALESCE(v_ticket_type.quantity_reserved, 0);

    IF v_available < (v_item->>'quantity')::integer THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient stock', 'available', v_available);
    END IF;

    UPDATE public.ticket_types
    SET quantity_reserved = COALESCE(quantity_reserved, 0) + (v_item->>'quantity')::integer
    WHERE id = (v_item->>'ticket_type_id')::uuid;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- release_expired_reservations: releases expired order reservations
CREATE OR REPLACE FUNCTION public.release_expired_reservations(
  p_event_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_released integer := 0;
  v_order record;
  v_item jsonb;
BEGIN
  FOR v_order IN
    SELECT id, reserved_items, event_id
    FROM public.orders
    WHERE status IN ('pending', 'reserved')
      AND expires_at IS NOT NULL
      AND expires_at < now()
      AND (p_event_id IS NULL OR event_id = p_event_id)
  LOOP
    IF v_order.reserved_items IS NOT NULL AND jsonb_array_length(v_order.reserved_items) > 0 THEN
      FOR v_item IN SELECT * FROM jsonb_array_elements(v_order.reserved_items)
      LOOP
        UPDATE public.ticket_types
        SET quantity_reserved = GREATEST(0, COALESCE(quantity_reserved, 0) - (v_item->>'quantity')::integer)
        WHERE id = (v_item->>'ticket_type_id')::uuid;
      END LOOP;
    END IF;

    UPDATE public.orders
    SET status = 'hold_expired', updated_at = now()
    WHERE id = v_order.id;

    v_released := v_released + 1;
  END LOOP;

  RETURN v_released;
END;
$$;

-- convert_reservation_to_sold: converts reserved qty to sold qty
CREATE OR REPLACE FUNCTION public.convert_reservation_to_sold(
  p_order_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE public.ticket_types
    SET
      quantity_reserved = GREATEST(0, COALESCE(quantity_reserved, 0) - (v_item->>'quantity')::integer),
      quantity_sold = quantity_sold + (v_item->>'quantity')::integer,
      updated_at = now()
    WHERE id = (v_item->>'ticket_type_id')::uuid;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- increment_promo_usage: atomically increment promo code usage
CREATE OR REPLACE FUNCTION public.increment_promo_usage(p_promo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.promo_codes
  SET used_count = COALESCE(used_count, 0) + 1
  WHERE id = p_promo_id;
END;
$$;

-- deduct_drink_stock: decrement drink stock for an event
CREATE OR REPLACE FUNCTION public.deduct_drink_stock(
  p_event_id uuid,
  p_drink_id uuid,
  p_quantity integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current integer;
BEGIN
  SELECT stock_current INTO v_current
  FROM public.drink_stock
  WHERE drink_id = p_drink_id AND event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stock record not found');
  END IF;

  IF v_current < p_quantity THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient stock', 'available', v_current);
  END IF;

  UPDATE public.drink_stock
  SET stock_current = stock_current - p_quantity,
      updated_at = now()
  WHERE drink_id = p_drink_id AND event_id = p_event_id;

  RETURN jsonb_build_object('success', true, 'remaining', v_current - p_quantity);
END;
$$;

-- generate_drink_order_display_code: generate unique 6-char display code
CREATE OR REPLACE FUNCTION public.generate_drink_order_display_code(p_event_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_exists boolean;
  v_attempts integer := 0;
BEGIN
  LOOP
    v_code := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    SELECT EXISTS(SELECT 1 FROM public.drink_orders WHERE display_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists OR v_attempts > 100;
    v_attempts := v_attempts + 1;
  END LOOP;
  RETURN v_code;
END;
$$;

-- mark_drink_order_delivered: marks a drink order as delivered
CREATE OR REPLACE FUNCTION public.mark_drink_order_delivered(
  p_order_id uuid,
  p_staff_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.drink_orders
  SET status = 'DELIVERED',
      updated_at = now()
  WHERE id = p_order_id
    AND status IN ('PAID', 'IN_PROGRESS', 'READY');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found or invalid status');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- list_user_roles_with_email: returns user roles joined with auth email
CREATE OR REPLACE FUNCTION public.list_user_roles_with_email()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  role text,
  brand text,
  event_id uuid,
  is_active boolean,
  display_name text,
  created_at timestamptz,
  email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Only super_admins can call this
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role = 'super_admin'
    AND ur.is_active = true
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  RETURN QUERY
  SELECT
    ur.id,
    ur.user_id,
    ur.role,
    ur.brand,
    ur.event_id,
    ur.is_active,
    ur.display_name,
    ur.created_at,
    au.email
  FROM public.user_roles ur
  LEFT JOIN auth.users au ON au.id = ur.user_id
  ORDER BY ur.created_at DESC;
END;
$$;

NOTIFY pgrst, 'reload schema';
