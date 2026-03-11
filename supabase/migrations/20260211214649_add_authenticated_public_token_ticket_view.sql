/*
  # Allow authenticated users to view tickets by public_token

  1. Security Changes
    - Add SELECT policy on `tickets` for `authenticated` role
    - Allows viewing tickets that have a `public_token` set
    - This matches the existing anon policy that already allows public ticket viewing
    - Admins/scanners retain their existing broader access via the other policy

  2. Why
    - Users clicking email links while having a stored browser session
      are treated as `authenticated`, not `anon`
    - The existing authenticated SELECT policy only allows admins/scanners
    - This caused "Ticket ongeldig of verlopen" for regular visitors with a session
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.tickets'::regclass
    AND polname = 'Authenticated can view ticket by public_token'
  ) THEN
    CREATE POLICY "Authenticated can view ticket by public_token"
      ON tickets
      FOR SELECT
      TO authenticated
      USING (public_token IS NOT NULL);
  END IF;
END $$;
