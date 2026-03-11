/*
  # Optimize RLS policies - Part 2: brands, scanner_users, scanner_sessions
  
  1. Changes
    - Replace auth.uid() with (select auth.uid()) in RLS policies
    - Improves query performance at scale
  
  2. Tables Updated
    - brands: Super admin policies
    - scanner_users: Scanner and admin policies
    - scanner_sessions: Scanner and admin policies
*/

-- brands: Optimize "Super admins can insert brands" policy
DROP POLICY IF EXISTS "Super admins can insert brands" ON brands;
CREATE POLICY "Super admins can insert brands"
  ON brands FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
      AND user_roles.role = 'super_admin'
    )
  );

-- brands: Optimize "Super admins can update brands" policy
DROP POLICY IF EXISTS "Super admins can update brands" ON brands;
CREATE POLICY "Super admins can update brands"
  ON brands FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
      AND user_roles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
      AND user_roles.role = 'super_admin'
    )
  );

-- brands: Optimize "Super admins can delete brands" policy
DROP POLICY IF EXISTS "Super admins can delete brands" ON brands;
CREATE POLICY "Super admins can delete brands"
  ON brands FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
      AND user_roles.role = 'super_admin'
    )
  );

-- scanner_users: Optimize "Scanner users can view own profile" policy
DROP POLICY IF EXISTS "Scanner users can view own profile" ON scanner_users;
CREATE POLICY "Scanner users can view own profile"
  ON scanner_users FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- scanner_users: Optimize "Admins can view all scanner users" policy
DROP POLICY IF EXISTS "Admins can view all scanner users" ON scanner_users;
CREATE POLICY "Admins can view all scanner users"
  ON scanner_users FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
      AND user_roles.role = ANY (ARRAY['super_admin'::text, 'admin'::text])
    )
  );

-- scanner_users: Optimize "Admins can manage scanner users" policy
DROP POLICY IF EXISTS "Admins can manage scanner users" ON scanner_users;
CREATE POLICY "Admins can manage scanner users"
  ON scanner_users FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
      AND user_roles.role = ANY (ARRAY['super_admin'::text, 'admin'::text])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
      AND user_roles.role = ANY (ARRAY['super_admin'::text, 'admin'::text])
    )
  );

-- scanner_sessions: Optimize "Scanner users can view own sessions" policy
DROP POLICY IF EXISTS "Scanner users can view own sessions" ON scanner_sessions;
CREATE POLICY "Scanner users can view own sessions"
  ON scanner_sessions FOR SELECT
  TO authenticated
  USING (
    scanner_user_id IN (
      SELECT id FROM scanner_users WHERE user_id = (SELECT auth.uid())
    )
  );

-- scanner_sessions: Optimize "Admins can view all sessions" policy
DROP POLICY IF EXISTS "Admins can view all sessions" ON scanner_sessions;
CREATE POLICY "Admins can view all sessions"
  ON scanner_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
      AND user_roles.role = ANY (ARRAY['super_admin'::text, 'admin'::text])
    )
  );

-- scanner_sessions: Optimize "Scanner users can create sessions" policy
DROP POLICY IF EXISTS "Scanner users can create sessions" ON scanner_sessions;
CREATE POLICY "Scanner users can create sessions"
  ON scanner_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    scanner_user_id IN (
      SELECT id FROM scanner_users WHERE user_id = (SELECT auth.uid())
    )
  );

-- scanner_sessions: Optimize "Scanner users can update own sessions" policy
DROP POLICY IF EXISTS "Scanner users can update own sessions" ON scanner_sessions;
CREATE POLICY "Scanner users can update own sessions"
  ON scanner_sessions FOR UPDATE
  TO authenticated
  USING (
    scanner_user_id IN (
      SELECT id FROM scanner_users WHERE user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    scanner_user_id IN (
      SELECT id FROM scanner_users WHERE user_id = (SELECT auth.uid())
    )
  );