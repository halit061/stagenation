/*
  # Fix user_roles policies for super_admin access

  1. Changes
    - Create a security definer function to check super_admin status (avoids recursion)
    - Add policies that use this function

  2. Security
    - Function runs with elevated privileges but only returns a boolean
    - Policies use this safe function to check access
*/

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'superadmin')
    AND is_active = true
  );
$$;

CREATE POLICY "super_admins_can_view_all_roles"
  ON user_roles
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

CREATE POLICY "super_admins_can_update_roles"
  ON user_roles
  FOR UPDATE
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "super_admins_can_delete_roles"
  ON user_roles
  FOR DELETE
  TO authenticated
  USING (public.is_super_admin());