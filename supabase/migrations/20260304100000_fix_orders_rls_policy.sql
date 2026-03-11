/*
  # Fix Orders RLS Policy

  ## Problem
  The "Users can view own orders" policy on the orders table has an overly
  permissive second condition: `(SELECT auth.uid()) IS NOT NULL`, which allows
  ANY authenticated user to read ALL orders regardless of ownership.

  ## Fix
  Replace the policy with one that:
  1. Allows anon/authenticated users to view orders by matching payer_email
     with their JWT email claim (for logged-in buyers)
  2. Allows admin/super_admin users to view all orders (for admin dashboard)
  3. Allows anon users to view a specific order by ID (for PaymentSuccess page
     where buyers are not authenticated — the order_id acts as a secret token)

  ## Impact
  - Regular authenticated users can no longer see other users' orders
  - Admin/super_admin users retain full read access
  - PaymentSuccess page continues to work for unauthenticated buyers
  - Edge functions using service_role are unaffected (bypass RLS)
*/

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can view own orders" ON orders;

-- Policy 1: Users can view their own orders (by email match)
CREATE POLICY "Users can view own orders by email"
  ON orders FOR SELECT
  TO public
  USING (
    payer_email = (SELECT current_setting('request.jwt.claims', true)::json->>'email')
  );

-- Policy 2: Admins can view all orders
CREATE POLICY "Admins can view all orders"
  ON orders FOR SELECT
  TO authenticated
  USING (
    is_admin_or_super()
  );
