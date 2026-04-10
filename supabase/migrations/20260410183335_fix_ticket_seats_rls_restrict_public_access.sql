/*
  # Restrict ticket_seats public read access

  1. Security Changes
    - Remove overly permissive `USING (true)` policies on `ticket_seats` for anon and public roles
    - Replace with session-based access: anon/public users can only read ticket_seats
      that belong to orders matching their session_id header
    - Admin access remains unchanged (admins can read all ticket_seats)

  2. Important Notes
    - This prevents unauthenticated users from enumerating all ticket codes and QR data
    - Visitors can still view their own tickets via the session_id passed in request headers
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ticket_seats' AND policyname = 'Anon can read ticket seats'
  ) THEN
    DROP POLICY "Anon can read ticket seats" ON ticket_seats;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ticket_seats' AND policyname = 'Public can read ticket seats'
  ) THEN
    DROP POLICY "Public can read ticket seats" ON ticket_seats;
  END IF;
END $$;

CREATE POLICY "Anon can read own session ticket seats"
  ON ticket_seats
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = ticket_seats.order_id
      AND o.session_id IS NOT NULL
      AND o.session_id = (current_setting('request.headers', true)::json ->> 'x-session-id')
    )
  );

CREATE POLICY "Authenticated can read own ticket seats"
  ON ticket_seats
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = ticket_seats.order_id
      AND (
        o.session_id = (current_setting('request.headers', true)::json ->> 'x-session-id')
        OR o.payer_email = (current_setting('request.jwt.claims', true)::json ->> 'email')
      )
    )
    OR EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = ANY(ARRAY['super_admin', 'admin'])
      AND user_roles.is_active = true
    )
  );
