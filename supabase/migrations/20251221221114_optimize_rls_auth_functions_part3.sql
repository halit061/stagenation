/*
  # Optimize RLS policies - Part 3: user_roles
  
  1. Changes
    - Replace auth.uid() with (select auth.uid()) in user_roles policies
    - Improves query performance at scale
  
  2. Tables Updated
    - user_roles: Super admin management policies
*/

-- user_roles: Optimize "Super admins can create roles" policy
DROP POLICY IF EXISTS "Super admins can create roles" ON user_roles;
CREATE POLICY "Super admins can create roles"
  ON user_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
      AND user_roles.role = 'super_admin'
    )
  );

-- user_roles: Optimize "Super admins can update roles" policy
DROP POLICY IF EXISTS "Super admins can update roles" ON user_roles;
CREATE POLICY "Super admins can update roles"
  ON user_roles FOR UPDATE
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

-- user_roles: Optimize "Super admins can delete roles" policy
DROP POLICY IF EXISTS "Super admins can delete roles" ON user_roles;
CREATE POLICY "Super admins can delete roles"
  ON user_roles FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
      AND user_roles.role = 'super_admin'
    )
  );