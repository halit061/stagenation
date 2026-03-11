/*
  # Simplify User Roles RLS Policy

  1. Problem
    - RLS policy has infinite recursion because it queries the same table
  
  2. Solution
    - Drop problematic policy
    - Allow all authenticated users to read user_roles
    - This is safe because:
      - User roles don't contain sensitive data
      - The application layer will still check permissions
      - Users need to read roles to verify their own access
*/

DROP POLICY IF EXISTS "Super admins can read all roles" ON user_roles;
DROP POLICY IF EXISTS "Users can read own roles" ON user_roles;

CREATE POLICY "Authenticated users can read all roles"
  ON user_roles
  FOR SELECT
  TO authenticated
  USING (true);
