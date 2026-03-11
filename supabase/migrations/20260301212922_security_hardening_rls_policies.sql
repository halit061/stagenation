/*
  # Security Hardening - RLS Policy Fixes

  ## Summary
  Tightens overly permissive RLS policies on critical tables without breaking
  existing checkout, table reservation, or ticket viewing flows.

  ## Changes

  ### tickets table
  1. Drop dangerous anon SELECT policy (was USING true - exposed ALL tickets to anon)
  2. Replace with scoped anon policy: only rows that have a public_token set
  3. Fix authenticated public_token policy to same scope

  ### table_bookings table
  4. Drop "Anyone can view own bookings by email" which used USING(true)
  5. Add scoped public policy: anon can only see PAID bookings (for availability check)
  6. Add authenticated policy: users see own bookings by email or admins see all

  ### table_guests table
  7. Add missing DELETE policy for admins

  ### Indexes
  8. Add indexes on columns used in policy conditions

  ## Checkout Compatibility
  - Orders INSERT (public) unchanged
  - Tickets INSERT (public for active events) unchanged
  - Table bookings INSERT (public for active events) unchanged
  - Table booking status check (public PAID only) still works for FloorPlan
*/

-- ============================================================
-- TICKETS: Fix anon SELECT
-- ============================================================

DROP POLICY IF EXISTS "Public can view ticket by public_token" ON tickets;

CREATE POLICY "Anon can view ticket by public_token"
  ON tickets
  FOR SELECT
  TO anon
  USING (public_token IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can view ticket by public_token" ON tickets;

CREATE POLICY "Authenticated can view ticket by public_token"
  ON tickets
  FOR SELECT
  TO authenticated
  USING (public_token IS NOT NULL);

-- ============================================================
-- TABLE_BOOKINGS: Replace USING(true) with scoped policies
-- ============================================================

DROP POLICY IF EXISTS "Anyone can view own bookings by email" ON table_bookings;

CREATE POLICY "Anon can check paid booking status"
  ON table_bookings
  FOR SELECT
  TO anon
  USING (status = 'PAID');

CREATE POLICY "Authenticated can view own or admin all bookings"
  ON table_bookings
  FOR SELECT
  TO authenticated
  USING (
    customer_email = (auth.jwt() ->> 'email')
    OR is_admin_or_super()
  );

-- ============================================================
-- TABLE_GUESTS: Add missing DELETE policy for admins
-- ============================================================

DROP POLICY IF EXISTS "Admins can delete table guests" ON table_guests;

CREATE POLICY "Admins can delete table guests"
  ON table_guests
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = ( SELECT auth.uid() )
      AND user_roles.role IN ('super_admin', 'superadmin', 'admin')
      AND user_roles.is_active = true
    )
  );

-- ============================================================
-- Performance indexes for policy conditions
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_tickets_public_token
  ON tickets (public_token) WHERE public_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_table_bookings_status
  ON table_bookings (status);

CREATE INDEX IF NOT EXISTS idx_table_bookings_customer_email
  ON table_bookings (customer_email);
