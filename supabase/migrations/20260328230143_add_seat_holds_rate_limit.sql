/*
  # Seat Holds Rate Limiting

  ## Overview
  Adds a rate-limiting function for seat_holds to prevent abuse.
  Limits each session/user to 20 holds per hour.

  ## New Functions
  - check_seat_hold_rate_limit(p_user_id, p_session_id): returns boolean
    Checks if the user/session has fewer than 20 active holds created in the last hour.
    Called before inserting new holds.
*/

CREATE OR REPLACE FUNCTION public.check_seat_hold_rate_limit(
  p_user_id uuid DEFAULT NULL,
  p_session_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hold_count integer;
BEGIN
  SELECT count(*) INTO hold_count
  FROM public.seat_holds
  WHERE created_at > now() - interval '1 hour'
    AND status = 'held'
    AND (
      (p_user_id IS NOT NULL AND user_id = p_user_id)
      OR (p_session_id IS NOT NULL AND session_id = p_session_id)
    );

  RETURN hold_count < 20;
END;
$$;
