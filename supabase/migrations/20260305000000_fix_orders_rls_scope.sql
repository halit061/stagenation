/*
  # Fix Orders RLS Policy Scope

  ## Problem
  The "Users can view own orders by email" policy is scoped TO public (includes anon role),
  which could allow unauthenticated connections to query orders by email.

  ## Fix
  Scope the email-based lookup policy to authenticated users only.
  The PaymentSuccess page uses edge functions with service_role (bypasses RLS) for order lookups.
*/

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can view own orders by email" ON orders;

-- Recreate with authenticated-only scope
CREATE POLICY "Users can view own orders by email"
  ON orders FOR SELECT
  TO authenticated
  USING (
    payer_email = (SELECT current_setting('request.jwt.claims', true)::json->>'email')
  );
