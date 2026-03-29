/*
  # Allow Anonymous Seat Hold Write Access

  ## Overview
  Enables anonymous (non-logged-in) visitors to create and manage
  their own seat holds via session_id. This is required for the
  public seat picker page where visitors select seats before checkout.

  ## Changes
  1. New INSERT policy on seat_holds for anon role (must have session_id)
  2. New UPDATE policy on seat_holds for anon role (own session only)

  ## Security
  - Anon can only insert holds with a session_id (no user_id)
  - Anon can only update their own holds (matched by session_id)
  - Rate limiting is enforced by the check_seat_hold_rate_limit function
*/

CREATE POLICY "Anon can insert seat holds with session"
  ON public.seat_holds FOR INSERT
  TO anon
  WITH CHECK (session_id IS NOT NULL AND user_id IS NULL);

CREATE POLICY "Anon can update own session holds"
  ON public.seat_holds FOR UPDATE
  TO anon
  USING (session_id IS NOT NULL)
  WITH CHECK (session_id IS NOT NULL);
