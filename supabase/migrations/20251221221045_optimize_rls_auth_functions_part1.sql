/*
  # Optimize RLS policies - Part 1: orders, staff_invites, scan_logs
  
  1. Changes
    - Replace auth.uid() with (select auth.uid()) in RLS policies
    - This prevents re-evaluation of auth functions for each row
    - Improves query performance at scale
  
  2. Tables Updated
    - orders: Users can view own orders
    - staff_invites: Admins can read invites
    - scan_logs: Multiple policies
*/

-- orders: Optimize "Users can view own orders" policy
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT
  TO public
  USING (
    (payer_email = (SELECT ((current_setting('request.jwt.claims'::text, true))::json ->> 'email'::text)))
    OR (SELECT auth.uid()) IS NOT NULL
  );

-- staff_invites: Optimize "Admins can read invites" policy
DROP POLICY IF EXISTS "Admins can read invites" ON staff_invites;
CREATE POLICY "Admins can read invites"
  ON staff_invites FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
      AND user_roles.role = ANY (ARRAY['super_admin'::text, 'admin'::text])
    )
  );

-- scan_logs: Optimize "Scanner users can view own scan logs" policy
DROP POLICY IF EXISTS "Scanner users can view own scan logs" ON scan_logs;
CREATE POLICY "Scanner users can view own scan logs"
  ON scan_logs FOR SELECT
  TO authenticated
  USING (scanner_user_id = (SELECT auth.uid()));

-- scan_logs: Optimize "Admins can view all scan logs" policy
DROP POLICY IF EXISTS "Admins can view all scan logs" ON scan_logs;
CREATE POLICY "Admins can view all scan logs"
  ON scan_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
      AND user_roles.role = ANY (ARRAY['super_admin'::text, 'admin'::text])
    )
  );

-- scan_logs: Optimize "Scanner users can create scan logs" policy
DROP POLICY IF EXISTS "Scanner users can create scan logs" ON scan_logs;
CREATE POLICY "Scanner users can create scan logs"
  ON scan_logs FOR INSERT
  TO authenticated
  WITH CHECK (scanner_user_id = (SELECT auth.uid()));