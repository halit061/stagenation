/*
  # Fix User Roles Access - Add INSERT Policy

  1. Problem
    - The user_roles table is missing an INSERT policy
    - Super admins cannot add new roles via the API
    
  2. Solution
    - Add INSERT policy for super admins
    - Refresh the schema cache to ensure table is accessible
    
  3. Security
    - Only super admins can insert new roles
    - Maintains existing SELECT, UPDATE, DELETE policies
*/

-- Add INSERT policy for super admins (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_roles' 
    AND policyname = 'super_admins_can_insert_roles'
  ) THEN
    CREATE POLICY "super_admins_can_insert_roles"
      ON user_roles
      FOR INSERT
      TO authenticated
      WITH CHECK (is_super_admin());
  END IF;
END $$;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
