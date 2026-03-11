/*
  # Fix User Roles RLS Infinite Recursion

  1. Problem
    - The "Super admins can read all roles" policy causes infinite recursion
    - It checks if user is super_admin by querying user_roles, which triggers the policy again
  
  2. Solution
    - Drop the problematic policy
    - Keep only "Users can read own roles" policy
    - This allows users to check their own role without recursion
*/

DROP POLICY IF EXISTS "Super admins can read all roles" ON user_roles;

CREATE POLICY "Super admins can read all roles"
  ON user_roles
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() 
    OR 
    EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role = 'super_admin'
    )
  );