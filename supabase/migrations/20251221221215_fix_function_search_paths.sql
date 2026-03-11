/*
  # Fix function search_path mutability
  
  1. Changes
    - Set search_path to 'public' for all functions
    - Prevents security issues with mutable search_path
  
  2. Functions Updated
    - has_role
    - is_super_admin
    - get_accessible_event_ids
    - bulk_create_tickets
*/

-- Fix has_role function
CREATE OR REPLACE FUNCTION public.has_role(required_role text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_id = auth.uid()
    AND role = required_role
  );
END;
$$;

-- Fix is_super_admin function
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  );
END;
$$;

-- Fix get_accessible_event_ids function
CREATE OR REPLACE FUNCTION public.get_accessible_event_ids()
RETURNS TABLE(event_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  -- Super admins can access all events
  IF EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  ) THEN
    RETURN QUERY SELECT id FROM events;
    RETURN;
  END IF;

  -- Return events based on user roles
  RETURN QUERY
  SELECT DISTINCT ur.event_id
  FROM user_roles ur
  WHERE ur.user_id = auth.uid()
  AND ur.event_id IS NOT NULL;
END;
$$;

-- Fix bulk_create_tickets function
CREATE OR REPLACE FUNCTION public.bulk_create_tickets(
  p_event_id uuid,
  p_ticket_type_id uuid,
  p_quantity integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_ids uuid[];
  v_ticket record;
  v_result json;
BEGIN
  -- Check if user is super_admin
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Only super admins can bulk create tickets';
  END IF;

  -- Create tickets
  WITH inserted_tickets AS (
    INSERT INTO tickets (
      event_id,
      ticket_type_id,
      order_id,
      ticket_number,
      token,
      status,
      issued_at
    )
    SELECT
      p_event_id,
      p_ticket_type_id,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'BULK-' || gen_random_uuid()::text,
      encode(gen_random_bytes(32), 'hex'),
      'valid',
      now()
    FROM generate_series(1, p_quantity)
    RETURNING id
  )
  SELECT array_agg(id) INTO v_ticket_ids FROM inserted_tickets;

  -- Return result
  SELECT json_build_object(
    'success', true,
    'ticket_ids', v_ticket_ids,
    'count', array_length(v_ticket_ids, 1)
  ) INTO v_result;

  RETURN v_result;
END;
$$;