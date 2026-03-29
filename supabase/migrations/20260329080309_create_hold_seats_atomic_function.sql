/*
  # Create atomic hold_seats_atomic function

  1. New Functions
    - `hold_seats_atomic(p_seat_ids, p_event_id, p_user_id, p_session_id, p_hold_minutes)`
      - Atomically holds seats with row-level locking to prevent race conditions
      - Cleans up expired holds first
      - Returns JSONB with success/failure and details
    - `extend_seat_holds(p_session_id, p_event_id, p_extra_minutes)`
      - Extends active holds for a session by additional minutes
      - Returns new expires_at timestamp
    - `release_session_holds(p_session_id, p_event_id)`
      - Releases all active holds for a session
      - Resets seat statuses back to available

  2. Security
    - Functions use SECURITY DEFINER with explicit search_path
    - Granted to both authenticated and anon roles
    - Session-based access control built into the functions

  3. Important Notes
    - Uses FOR UPDATE row locking for race condition prevention
    - Cleans expired holds before processing new ones
    - Returns structured JSONB for consistent client handling
*/

CREATE OR REPLACE FUNCTION public.hold_seats_atomic(
  p_seat_ids UUID[],
  p_event_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_hold_minutes INTEGER DEFAULT 10
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unavailable UUID[];
  v_expires_at TIMESTAMPTZ;
  v_hold_ids UUID[];
BEGIN
  UPDATE seat_holds SET status = 'released'
  WHERE status = 'held' AND expires_at < now();

  UPDATE seats SET status = 'available'
  WHERE status = 'reserved'
  AND id IN (
    SELECT seat_id FROM seat_holds
    WHERE status = 'released'
    AND expires_at < now()
  )
  AND id NOT IN (
    SELECT seat_id FROM seat_holds
    WHERE status = 'held' AND expires_at >= now()
  );

  PERFORM id FROM seats
  WHERE id = ANY(p_seat_ids)
  FOR UPDATE;

  SELECT array_agg(id) INTO v_unavailable
  FROM seats
  WHERE id = ANY(p_seat_ids)
  AND (status != 'available' OR is_active = false);

  IF v_unavailable IS NOT NULL AND array_length(v_unavailable, 1) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'seats_unavailable',
      'unavailable_seats', to_jsonb(v_unavailable)
    );
  END IF;

  v_expires_at := now() + (p_hold_minutes || ' minutes')::interval;

  WITH inserted AS (
    INSERT INTO seat_holds (seat_id, event_id, user_id, session_id, expires_at, status)
    SELECT unnest(p_seat_ids), p_event_id, p_user_id, p_session_id, v_expires_at, 'held'
    RETURNING id
  )
  SELECT array_agg(id) INTO v_hold_ids FROM inserted;

  UPDATE seats SET status = 'reserved'
  WHERE id = ANY(p_seat_ids);

  RETURN jsonb_build_object(
    'success', true,
    'hold_ids', to_jsonb(v_hold_ids),
    'expires_at', v_expires_at::text
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.hold_seats_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.hold_seats_atomic TO anon;

CREATE OR REPLACE FUNCTION public.extend_seat_holds(
  p_session_id TEXT,
  p_event_id UUID,
  p_extra_minutes INTEGER DEFAULT 5
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_expires TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  v_new_expires := now() + (p_extra_minutes || ' minutes')::interval;

  UPDATE seat_holds
  SET expires_at = GREATEST(expires_at, now()) + (p_extra_minutes || ' minutes')::interval
  WHERE session_id = p_session_id
  AND event_id = p_event_id
  AND status = 'held';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_active_holds');
  END IF;

  SELECT MAX(expires_at) INTO v_new_expires
  FROM seat_holds
  WHERE session_id = p_session_id
  AND event_id = p_event_id
  AND status = 'held';

  RETURN jsonb_build_object(
    'success', true,
    'expires_at', v_new_expires::text,
    'extended_count', v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.extend_seat_holds TO authenticated;
GRANT EXECUTE ON FUNCTION public.extend_seat_holds TO anon;

CREATE OR REPLACE FUNCTION public.release_session_holds(
  p_session_id TEXT,
  p_event_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seat_ids UUID[];
  v_count INTEGER;
BEGIN
  SELECT array_agg(seat_id) INTO v_seat_ids
  FROM seat_holds
  WHERE session_id = p_session_id
  AND event_id = p_event_id
  AND status = 'held';

  IF v_seat_ids IS NULL THEN
    RETURN jsonb_build_object('success', true, 'released_count', 0);
  END IF;

  UPDATE seat_holds SET status = 'released'
  WHERE session_id = p_session_id
  AND event_id = p_event_id
  AND status = 'held';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE seats SET status = 'available'
  WHERE id = ANY(v_seat_ids)
  AND status = 'reserved'
  AND id NOT IN (
    SELECT seat_id FROM seat_holds
    WHERE status = 'held' AND expires_at >= now()
    AND session_id != p_session_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'released_count', v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_session_holds TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_session_holds TO anon;
