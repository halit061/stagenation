/*
  # Create atomic function for guest ticket seat assignment

  1. New Functions
    - `assign_guest_seats_atomic(p_seat_ids uuid[], p_event_id uuid)`
      - Atomically locks and marks seats as 'sold' for guest ticket assignment
      - Uses FOR UPDATE row-level locking to prevent race conditions
      - Only assigns seats that are currently 'available'
      - Returns success/failure with details of any unavailable seats
      - Prevents double-selling between live purchases and guest ticket assignments

  2. Security
    - SECURITY DEFINER with explicit search_path
    - Only granted to service_role (admin operations only)

  3. Important Notes
    - This replaces the non-atomic seat-by-seat updates in the send-guest-ticket edge function
    - Blocked seats cannot be assigned (status must be 'available')
    - Reserved seats (in checkout flow) cannot be assigned (status must be 'available')
*/

CREATE OR REPLACE FUNCTION public.assign_guest_seats_atomic(
  p_seat_ids UUID[],
  p_event_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unavailable_ids UUID[];
  v_unavailable_statuses TEXT[];
  v_updated_count INTEGER;
BEGIN
  IF p_seat_ids IS NULL OR array_length(p_seat_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', true, 'updated_count', 0);
  END IF;

  PERFORM id FROM seats
  WHERE id = ANY(p_seat_ids)
  FOR UPDATE;

  SELECT
    array_agg(id),
    array_agg(status)
  INTO v_unavailable_ids, v_unavailable_statuses
  FROM seats
  WHERE id = ANY(p_seat_ids)
  AND (status != 'available' OR is_active = false);

  IF v_unavailable_ids IS NOT NULL AND array_length(v_unavailable_ids, 1) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'seats_unavailable',
      'unavailable_count', array_length(v_unavailable_ids, 1),
      'unavailable_seats', to_jsonb(v_unavailable_ids),
      'statuses', to_jsonb(v_unavailable_statuses)
    );
  END IF;

  UPDATE seats
  SET status = 'sold'
  WHERE id = ANY(p_seat_ids)
  AND status = 'available';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_updated_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_guest_seats_atomic TO service_role;
