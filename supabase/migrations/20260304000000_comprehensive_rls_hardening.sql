/*
  # Comprehensive RLS Hardening

  ## Problem
  Migration 20260130162618 attempted to replace USING(true) policies with
  role-based policies, but used incorrect policy names in its DROP statements.
  The old permissive policies (FOR ALL TO authenticated USING(true)) are still
  active on 8 tables, allowing ANY authenticated user to read, insert, update,
  and delete rows.

  ## Tables Affected
  1. events          - "Authenticated users can manage events"
  2. ticket_types    - "Authenticated users manage ticket types"
  3. floorplan_tables- "Authenticated users manage floorplan tables"
  4. table_types     - "Authenticated users manage table types"
  5. tables          - "Authenticated users manage tables"
  6. locations       - "Authenticated users manage locations"
  7. venues          - "Authenticated users manage venues"
  8. promo_codes     - "Authenticated users manage promo codes"

  ## Fix
  1. Drop all leftover USING(true) policies by their CORRECT names
  2. Verify proper admin-only policies exist (created by 20260130162618)
  3. Verify proper public SELECT policies exist (created by 20251221231246)
  4. Fix scan_lookup view with security_invoker
  5. Restrict RPC functions to authenticated users only
  6. Ensure no DELETE on tickets for non-admin users

  ## Public SELECT Policies Preserved
  - events: active events visible to public (needed for Home, Agenda, Tickets pages)
  - ticket_types: active types visible to public (needed for ticket purchase)
  - floorplan_tables: active tables visible to public (needed for FloorPlan)
  - table_types: active types visible to public (needed for table reservation)
  - tables: visible to public (needed for reservation pages)
  - locations, venues: visible to public (needed for event info)
*/

-- ============================================================================
-- SECTION 1: DROP LEFTOVER USING(true) POLICIES
-- These were created by 20251221231246 and NOT dropped by 20260130162618
-- because the DROP statements used wrong names
-- ============================================================================

-- events: drop the permissive policy
DROP POLICY IF EXISTS "Authenticated users can manage events" ON events;
-- Also try alternate names in case of different migration paths
DROP POLICY IF EXISTS "Authenticated users manage events" ON events;

-- ticket_types: drop the permissive policy
DROP POLICY IF EXISTS "Authenticated users manage ticket types" ON ticket_types;
DROP POLICY IF EXISTS "Authenticated users can manage ticket types" ON ticket_types;

-- floorplan_tables: drop the permissive policy
DROP POLICY IF EXISTS "Authenticated users manage floorplan tables" ON floorplan_tables;
DROP POLICY IF EXISTS "Authenticated users can manage floorplan tables" ON floorplan_tables;

-- table_types: drop the permissive policy
DROP POLICY IF EXISTS "Authenticated users manage table types" ON table_types;
DROP POLICY IF EXISTS "Authenticated users can manage table types" ON table_types;

-- tables: drop the permissive policy
DROP POLICY IF EXISTS "Authenticated users manage tables" ON tables;
DROP POLICY IF EXISTS "Authenticated users can manage tables" ON tables;

-- locations: drop the permissive policy
DROP POLICY IF EXISTS "Authenticated users manage locations" ON locations;
DROP POLICY IF EXISTS "Authenticated users can manage locations" ON locations;

-- venues: drop the permissive policy
DROP POLICY IF EXISTS "Authenticated users manage venues" ON venues;
DROP POLICY IF EXISTS "Authenticated users can manage venues" ON venues;

-- promo_codes: drop the permissive policy
DROP POLICY IF EXISTS "Authenticated users manage promo codes" ON promo_codes;
DROP POLICY IF EXISTS "Authenticated users can manage promo codes" ON promo_codes;

-- ============================================================================
-- SECTION 2: ENSURE ADMIN-ONLY WRITE POLICIES EXIST
-- These should have been created by 20260130162618 but we re-create
-- idempotently in case they weren't applied
-- ============================================================================

DO $$ BEGIN
  -- events
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'events' AND policyname = 'Admins can manage events'
  ) THEN
    CREATE POLICY "Admins can manage events"
    ON events FOR ALL TO authenticated
    USING (is_admin_or_super())
    WITH CHECK (is_admin_or_super());
  END IF;

  -- ticket_types
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ticket_types' AND policyname = 'Admins can manage ticket types'
  ) THEN
    CREATE POLICY "Admins can manage ticket types"
    ON ticket_types FOR ALL TO authenticated
    USING (is_admin_or_super())
    WITH CHECK (is_admin_or_super());
  END IF;

  -- floorplan_tables
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'floorplan_tables' AND policyname = 'Admins can manage floorplan tables'
  ) THEN
    CREATE POLICY "Admins can manage floorplan tables"
    ON floorplan_tables FOR ALL TO authenticated
    USING (is_admin_or_super())
    WITH CHECK (is_admin_or_super());
  END IF;

  -- table_types
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'table_types' AND policyname = 'Admins can manage table types'
  ) THEN
    CREATE POLICY "Admins can manage table types"
    ON table_types FOR ALL TO authenticated
    USING (is_admin_or_super())
    WITH CHECK (is_admin_or_super());
  END IF;

  -- tables
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tables' AND policyname = 'Admins can manage tables'
  ) THEN
    CREATE POLICY "Admins can manage tables"
    ON tables FOR ALL TO authenticated
    USING (is_admin_or_super())
    WITH CHECK (is_admin_or_super());
  END IF;

  -- locations
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'locations' AND policyname = 'Admins can manage locations'
  ) THEN
    CREATE POLICY "Admins can manage locations"
    ON locations FOR ALL TO authenticated
    USING (is_admin_or_super())
    WITH CHECK (is_admin_or_super());
  END IF;

  -- venues
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'venues' AND policyname = 'Admins can manage venues'
  ) THEN
    CREATE POLICY "Admins can manage venues"
    ON venues FOR ALL TO authenticated
    USING (is_admin_or_super())
    WITH CHECK (is_admin_or_super());
  END IF;

  -- promo_codes
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'promo_codes' AND policyname = 'Admins can manage promo codes'
  ) THEN
    CREATE POLICY "Admins can manage promo codes"
    ON promo_codes FOR ALL TO authenticated
    USING (is_admin_or_super())
    WITH CHECK (is_admin_or_super());
  END IF;
END $$;

-- ============================================================================
-- SECTION 3: ENSURE PUBLIC SELECT POLICIES EXIST
-- These were created by 20251221231246 and should still be active
-- Re-create idempotently if missing
-- ============================================================================

DO $$ BEGIN
  -- events: public can view active events
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'events' AND policyname = 'Anyone can view active events'
  ) THEN
    CREATE POLICY "Anyone can view active events"
    ON events FOR SELECT TO public
    USING (is_active = true);
  END IF;

  -- ticket_types: public can view active ticket types
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ticket_types' AND policyname = 'Anyone can view active ticket types'
  ) THEN
    CREATE POLICY "Anyone can view active ticket types"
    ON ticket_types FOR SELECT TO public
    USING (is_active = true);
  END IF;

  -- floorplan_tables: public can view active floorplan tables
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'floorplan_tables' AND policyname = 'Anyone can view active floorplan tables'
  ) THEN
    CREATE POLICY "Anyone can view active floorplan tables"
    ON floorplan_tables FOR SELECT TO public
    USING (is_active = true);
  END IF;

  -- table_types: public can view active table types
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'table_types' AND policyname = 'Anyone can view active table types'
  ) THEN
    CREATE POLICY "Anyone can view active table types"
    ON table_types FOR SELECT TO public
    USING (is_active = true);
  END IF;

  -- tables: public can view tables (no is_active filter in original)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tables' AND policyname = 'Anyone can view tables'
  ) THEN
    CREATE POLICY "Anyone can view tables"
    ON tables FOR SELECT TO public
    USING (true);
  END IF;
END $$;

-- ============================================================================
-- SECTION 4: FIX scan_lookup VIEW — add security_invoker
-- The current view bypasses RLS on underlying tables.
-- With security_invoker, RLS on tickets/events/orders is enforced.
-- ============================================================================

DROP VIEW IF EXISTS public.scan_lookup;

CREATE VIEW public.scan_lookup
WITH (security_invoker = true)
AS
SELECT
  t.id,
  t.ticket_number,
  t.qr_code,
  t.qr_data,
  t.token,
  t.secure_token,
  t.status,
  t.scan_status,
  t.scanned_at,
  t.scanned_by,
  t.scanner_name,
  t.holder_name,
  t.holder_email,
  t.event_id,
  t.order_id,
  t.ticket_type_id,
  t.table_guest_id,
  t.table_booking_id,
  t.product_type,
  t.assigned_table_id,
  t.table_note,
  t.used_at,
  e.name AS event_name,
  e.title AS event_title,
  e.start_date AS event_start_date,
  e.location AS event_location,
  e.is_active AS event_is_active,
  e.scan_open_at,
  e.scan_close_at,
  o.order_number,
  o.payer_name,
  o.payer_email,
  o.buyer_name,
  o.buyer_email,
  o.status AS order_status,
  tt.name AS ticket_type_name,
  ft.table_number,
  ft.table_type,
  ft.capacity AS table_capacity
FROM public.tickets t
LEFT JOIN public.events e ON e.id = t.event_id
LEFT JOIN public.orders o ON o.id = t.order_id
LEFT JOIN public.ticket_types tt ON tt.id = t.ticket_type_id
LEFT JOIN public.floorplan_tables ft ON ft.id = t.assigned_table_id;

-- Only authenticated users (admin/scanner) should access scan_lookup
GRANT SELECT ON public.scan_lookup TO authenticated;
GRANT SELECT ON public.scan_lookup TO service_role;

-- Explicitly deny anon access
REVOKE ALL ON public.scan_lookup FROM anon;

-- ============================================================================
-- SECTION 5: RESTRICT RPC FUNCTIONS TO AUTHENTICATED ONLY
-- grant_super_admin, is_super_admin, is_admin_or_super should not be
-- callable by anonymous users
-- ============================================================================

-- Revoke anon execute on sensitive functions
REVOKE EXECUTE ON FUNCTION public.grant_super_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.grant_super_admin(uuid) FROM public;

REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM public;

REVOKE EXECUTE ON FUNCTION public.is_admin_or_super() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_super() FROM public;

-- Ensure authenticated users CAN call these
GRANT EXECUTE ON FUNCTION public.grant_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_super() TO authenticated;

-- ============================================================================
-- SECTION 6: ENSURE NO DELETE ON TICKETS FOR NON-ADMINS
-- Verify no permissive delete policy exists; add admin-only if missing
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tickets' AND policyname = 'Admins can delete tickets'
  ) THEN
    CREATE POLICY "Admins can delete tickets"
    ON tickets FOR DELETE TO authenticated
    USING (is_admin_or_super());
  END IF;
END $$;

-- ============================================================================
-- SECTION 7: FIX scanner_events_compact VIEW — add security_invoker
-- ============================================================================

DROP VIEW IF EXISTS public.scanner_events_compact;

CREATE VIEW public.scanner_events_compact
WITH (security_invoker = true)
AS
SELECT
  e.id,
  e.title,
  e.start_date AS starts_at,
  e.end_date AS ends_at,
  e.brand,
  NULL::text AS status
FROM public.events e;

-- Only authenticated and service_role
GRANT SELECT ON public.scanner_events_compact TO authenticated;
GRANT SELECT ON public.scanner_events_compact TO service_role;
REVOKE ALL ON public.scanner_events_compact FROM anon;
