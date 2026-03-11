/*
  # Allow super_admins to view all user roles

  1. Changes
    - Add SELECT policy for super_admins to view all user_roles
    - Add UPDATE policy for super_admins to update user_roles
    - Add DELETE policy for super_admins to delete user_roles

  2. Security
    - Only users with super_admin role can view/manage all roles
    - Regular users can still only see their own roles
*/

CREATE POLICY "super_admins_can_view_all_roles"
  ON user_roles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin', 'superadmin')
      AND ur.is_active = true
    )
  );

CREATE POLICY "super_admins_can_update_roles"
  ON user_roles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin', 'superadmin')
      AND ur.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin', 'superadmin')
      AND ur.is_active = true
    )
  );

CREATE POLICY "super_admins_can_delete_roles"
  ON user_roles
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin', 'superadmin')
      AND ur.is_active = true
    )
  );