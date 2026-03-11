/*
  # Fix brands RLS policies - superadmin role name mismatch

  1. Problem
    - The brands table INSERT/UPDATE/DELETE policies check for role = 'superadmin'
    - But actual user_roles records use role = 'super_admin' (with underscore)
    - This causes "new row violates row-level security policy" when creating brands

  2. Fix
    - Drop and recreate INSERT, UPDATE, DELETE policies to check for both role variants
    - Uses the is_super_admin() function which already handles both variants
*/

DROP POLICY IF EXISTS "Super admins can insert brands" ON brands;
DROP POLICY IF EXISTS "Super admins can update brands" ON brands;
DROP POLICY IF EXISTS "Super admins can delete brands" ON brands;

CREATE POLICY "Super admins can insert brands"
  ON brands FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "Super admins can update brands"
  ON brands FOR UPDATE
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Super admins can delete brands"
  ON brands FOR DELETE
  TO authenticated
  USING (is_super_admin());