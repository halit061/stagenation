/*
  # Fix bulk_create_tickets function - replace eskiler fallback with stagenation

  1. Changes
    - Recreate bulk_create_tickets with 'stagenation' as the default brand fallback
    - No functional changes otherwise; all logic preserved
*/

CREATE OR REPLACE FUNCTION public.bulk_create_tickets(
  p_event_id uuid,
  p_ticket_type_id uuid,
  p_quantity integer,
  p_prefix text DEFAULT NULL::text,
  p_status text DEFAULT 'valid'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_is_authorized boolean := false;
  v_event record;
  v_ticket_type record;
  v_created_count integer := 0;
  v_ticket_id uuid;
  v_ticket_number text;
  v_secure_token text;
  v_random_part text;
  v_brand text;
  v_derived_prefix text;
  i integer;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = v_user_id
    AND (
      role = 'super_admin'
      OR (role = 'admin' AND (event_id = p_event_id OR event_id IS NULL))
    )
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: requires super_admin or admin role');
  END IF;

  IF p_quantity <= 0 OR p_quantity > 1000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Quantity must be between 1 and 1000');
  END IF;

  IF p_status NOT IN ('valid', 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Status must be either valid or pending');
  END IF;

  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event not found');
  END IF;

  SELECT * INTO v_ticket_type FROM ticket_types
  WHERE id = p_ticket_type_id AND event_id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ticket type not found or does not belong to this event');
  END IF;

  v_brand := COALESCE(v_event.brand, 'stagenation');

  IF p_prefix IS NOT NULL AND length(p_prefix) > 0 THEN
    v_derived_prefix := upper(substring(regexp_replace(p_prefix, '[^A-Za-z]', '', 'g') from 1 for 3));
  ELSE
    v_derived_prefix := upper(substring(regexp_replace(COALESCE(v_ticket_type.name, 'TKT'), '[^A-Za-z]', '', 'g') from 1 for 3));
  END IF;

  IF length(v_derived_prefix) < 3 THEN
    v_derived_prefix := rpad(v_derived_prefix, 3, 'X');
  END IF;

  FOR i IN 1..p_quantity LOOP
    v_ticket_id := gen_random_uuid();
    v_random_part := upper(substring(encode(gen_random_bytes(9), 'hex') from 1 for 12));
    v_ticket_number := format('%s-%s', v_derived_prefix, v_random_part);
    v_secure_token := encode(gen_random_bytes(32), 'base64');
    v_secure_token := replace(v_secure_token, '/', '_');
    v_secure_token := replace(v_secure_token, '+', '-');
    v_secure_token := replace(v_secure_token, '=', '');

    INSERT INTO tickets (
      id, order_id, event_id, ticket_type_id,
      ticket_number, token, secure_token, status, brand, issued_at
    ) VALUES (
      v_ticket_id,
      '00000000-0000-0000-0000-000000000000'::uuid,
      p_event_id,
      p_ticket_type_id,
      v_ticket_number,
      v_secure_token,
      v_secure_token,
      p_status,
      v_brand,
      NOW()
    );

    v_created_count := v_created_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'tickets_created', v_created_count,
    'event_id', p_event_id,
    'ticket_type_id', p_ticket_type_id,
    'event_name', v_event.name,
    'ticket_type_name', v_ticket_type.name,
    'brand', v_brand
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;
