/*
  # Restrict user_roles SELECT Policy

  ## Problem
  - "Authenticated users can read all roles" allows ANY authenticated user
    to read ALL user roles. This leaks role information about other users.

  ## Solution
  - Replace the overly permissive policy with two scoped policies:
    1. Regular users can only read their OWN roles
    2. Admins/super_admins can read all roles (needed for admin panel)
  - Uses is_admin_or_super() SECURITY DEFINER function to avoid infinite recursion
*/

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can read all roles" ON user_roles;

-- Users can read their own roles
CREATE POLICY "Users can read own roles"
  ON user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Admins can read all roles
CREATE POLICY "Admins can read all roles"
  ON user_roles
  FOR SELECT
  TO authenticated
  USING (is_admin_or_super());
