/*
  # Add user_roles management policies for SuperAdmin
  
  1. Changes
    - Add INSERT policy for super_admin users to create new roles
    - Add UPDATE policy for super_admin users to modify existing roles
    - Add DELETE policy for super_admin users to remove roles
  
  2. Security
    - Only users with super_admin role can manage user_roles
    - Policies check user_roles table to verify super_admin status
*/

-- Allow super_admins to insert new roles
CREATE POLICY "Super admins can create roles"
  ON user_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  );

-- Allow super_admins to update existing roles
CREATE POLICY "Super admins can update roles"
  ON user_roles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  );

-- Allow super_admins to delete roles
CREATE POLICY "Super admins can delete roles"
  ON user_roles FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  );