/*
  # Fix Table Guests RLS Policy for super_admin Role

  ## Summary
  The RLS policies check for 'superadmin' but some users have 'super_admin' (with underscore).
  This migration updates the policies to accept both variants.

  ## Changes
  1. Drop existing SELECT policy
  2. Create new SELECT policy that accepts both 'superadmin' and 'super_admin'
  3. Drop existing INSERT policy  
  4. Create new INSERT policy that accepts both role variants
  5. Drop existing UPDATE policy
  6. Create new UPDATE policy that accepts both role variants
*/

-- Drop and recreate SELECT policy
DROP POLICY IF EXISTS "Admins and organizers can view table guests" ON table_guests;

CREATE POLICY "Admins and organizers can view table guests"
  ON table_guests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('superadmin', 'super_admin', 'admin', 'organizer')
        AND (
          user_roles.role IN ('superadmin', 'super_admin')
          OR user_roles.event_id = table_guests.event_id
          OR user_roles.event_id IS NULL
        )
    )
  );

-- Drop and recreate INSERT policy
DROP POLICY IF EXISTS "Admins and organizers can create table guests" ON table_guests;

CREATE POLICY "Admins and organizers can create table guests"
  ON table_guests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('superadmin', 'super_admin', 'admin', 'organizer')
        AND (
          user_roles.role IN ('superadmin', 'super_admin')
          OR user_roles.event_id = table_guests.event_id
          OR user_roles.event_id IS NULL
        )
    )
    AND created_by_user_id = auth.uid()
  );

-- Drop and recreate UPDATE policy
DROP POLICY IF EXISTS "Scanners can update table guest status" ON table_guests;

CREATE POLICY "Scanners can update table guest status"
  ON table_guests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('superadmin', 'super_admin', 'scanner')
        AND (
          user_roles.role IN ('superadmin', 'super_admin')
          OR user_roles.event_id = table_guests.event_id
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('superadmin', 'super_admin', 'scanner')
        AND (
          user_roles.role IN ('superadmin', 'super_admin')
          OR user_roles.event_id = table_guests.event_id
        )
    )
  );
