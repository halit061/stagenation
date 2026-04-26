/*
  # Single seat hold release RPC

  ## Overview
  Adds a SECURITY DEFINER function that releases ONE seat hold for a given
  session. Mirrors the security model of `release_session_holds` (which
  releases ALL holds for a session). Lets users deselect a single held seat
  from the seat-picker after returning from checkout via "stoelen behouden",
  without having to release every other seat.

  ## New function
  - `release_single_seat_hold(p_session_id text, p_event_id uuid, p_seat_id uuid)`
    - Updates `seat_holds.status` from 'held' to 'released' for the row
      matching session + event + seat
    - Updates `seats.status` from 'reserved' to 'available' for that seat
    - Returns `{ success, released }` JSON
    - Idempotent: callable with no held row → returns released=0

  ## Security
  - SECURITY DEFINER with `set search_path = public`
  - GRANT EXECUTE to `anon` + `authenticated` (matches existing
    release_session_holds, hold_seats_atomic, extend_seat_holds)
  - Scoped strictly to the session_id passed in — cannot release another
    user's holds because the seat_holds row will not match
  - Only flips a `seat.status` from 'reserved' → 'available' (never touches
    'sold' or 'blocked'), so cannot leak paid/locked seats

  ## Notes
  1. No existing function modified; pure addition
  2. No table schema changes
  3. No RLS policy changes — function is SECURITY DEFINER and skips RLS for
     the strictly bounded action it performs
*/

CREATE OR REPLACE FUNCTION release_single_seat_hold(
  p_session_id TEXT,
  p_event_id UUID,
  p_seat_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_released_count INTEGER := 0;
BEGIN
  IF p_session_id IS NULL OR p_event_id IS NULL OR p_seat_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_args');
  END IF;

  UPDATE seat_holds
     SET status = 'released'
   WHERE session_id = p_session_id
     AND event_id   = p_event_id
     AND seat_id    = p_seat_id
     AND status     = 'held';
  GET DIAGNOSTICS v_released_count = ROW_COUNT;

  IF v_released_count > 0 THEN
    UPDATE seats
       SET status = 'available'
     WHERE id = p_seat_id
       AND status = 'reserved';
  END IF;

  RETURN jsonb_build_object('success', true, 'released', v_released_count);
END;
$$;

GRANT EXECUTE ON FUNCTION release_single_seat_hold(TEXT, UUID, UUID)
  TO anon, authenticated, service_role;
