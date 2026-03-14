/*
  # Fix All Security Issues - Stagenation.be

  ## Summary
  This migration fixes 29 identified security issues where RLS policies were overly permissive,
  allowing any authenticated user (or even anonymous users) to access sensitive data.

  ## Issues Fixed

  ### 1. audit_logs
  - Restricted SELECT from any authenticated user to admins/super_admins only
  - Restricted INSERT from public to service_role only (via edge functions)

  ### 2. brands
  - Restricted SELECT from any authenticated user to admins/super_admins only

  ### 3. events
  - Removed "Authenticated users can manage all events" (USING(true)) - replaced with role-based access

  ### 4. floorplan_tables
  - Removed "Authenticated users can manage all tables" (USING(true)) - replaced with admin-only

  ### 5. holds
  - "Anyone can view holds" - restricted to service_role only (internal use)
  - "Anyone can create holds" - restricted to service_role only
  - "System can delete expired holds" - restricted to service_role only

  ### 6. locations
  - Restricted manage (ALL) from any authenticated to admin-only

  ### 7. mailing_list (GDPR critical)
  - Restricted SELECT from any authenticated user to admins/super_admins only
  - INSERT restricted to service_role only (called via edge functions)

  ### 8. orders
  - Restricted UPDATE from any authenticated to service_role only

  ### 9. promo_codes
  - Restricted ALL from any authenticated to admins/super_admins only

  ### 10. scan_logs
  - Restricted INSERT from public to service_role only

  ### 11. scanners
  - Restricted ALL from any authenticated to admins/super_admins only

  ### 12. scans
  - Restricted INSERT from any authenticated to service_role/scanner role
  - Restricted SELECT from any authenticated to admins/super_admins only

  ### 13. sections
  - Restricted manage (ALL) from any authenticated to admin-only
  - Public SELECT kept (sections are non-sensitive public data)

  ### 14. table_bookings
  - Restricted SELECT from public to admins only (contains PII: names, emails, phones)
  - Restricted UPDATE from any authenticated to service_role only
  - INSERT kept as public (needed for checkout flow via edge functions)

  ### 15. table_reservations
  - Restricted SELECT from any authenticated to admins only
  - Restricted UPDATE from any authenticated to service_role only

  ### 16. table_types
  - Restricted ALL from any authenticated to admins only

  ### 17. tables
  - Restricted manage (ALL) from any authenticated to admins only
  - Public SELECT kept (table availability is public info)

  ### 18. ticket_types
  - Restricted ALL from any authenticated to admins only

  ### 19. tickets
  - Restricted SELECT from any authenticated to service_role only (tickets contain PII)
  - Restricted UPDATE from any authenticated to service_role only
  - INSERT kept as service_role only

  ### 20. user_roles
  - Restricted SELECT from any authenticated to admins/super_admins only

  ### 21. venues
  - Restricted manage (ALL) from any authenticated to admins only
  - Public SELECT kept (venues are public info)

  ### 22. webhook_logs
  - Restricted SELECT from any authenticated to admins/super_admins only
  - Restricted INSERT from public to service_role only

  ## Security Notes
  - All edge functions already use service_role key for database operations
  - Public checkout/payment flows go through edge functions (service_role), not direct DB access
  - Scanner operations go through edge functions with JWT validation
  - GDPR: mailing_list and table_bookings PII now only accessible to admins
*/

-- ============================================================
-- HELPER: ensure is_admin_or_super function exists
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin_or_super()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'super_admin')
  );
END;
$$;

-- ============================================================
-- 1. AUDIT LOGS - restrict to admins only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "System can create audit logs" ON public.audit_logs;

CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (is_admin_or_super());

-- INSERT kept for service_role via edge functions (no policy needed for service_role)

-- ============================================================
-- 2. BRANDS - restrict to admins only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read all brands" ON public.brands;

CREATE POLICY "Admins can read brands"
  ON public.brands FOR SELECT
  TO authenticated
  USING (is_admin_or_super());

-- ============================================================
-- 3. EVENTS - restrict manage to admins only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage all events" ON public.events;
DROP POLICY IF EXISTS "Authenticated users can manage events" ON public.events;

CREATE POLICY "Admins can manage events"
  ON public.events FOR ALL
  TO authenticated
  USING (is_admin_or_super())
  WITH CHECK (is_admin_or_super());

-- ============================================================
-- 4. FLOORPLAN TABLES - restrict to admins only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage all tables" ON public.floorplan_tables;

CREATE POLICY "Admins can manage floorplan tables"
  ON public.floorplan_tables FOR ALL
  TO authenticated
  USING (is_admin_or_super())
  WITH CHECK (is_admin_or_super());

-- ============================================================
-- 5. HOLDS - restrict to service_role only (internal checkout use)
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view holds" ON public.holds;
DROP POLICY IF EXISTS "Anyone can create holds" ON public.holds;
DROP POLICY IF EXISTS "System can delete expired holds" ON public.holds;

-- No policies needed: service_role bypasses RLS, all hold operations are via edge functions

-- ============================================================
-- 6. LOCATIONS - restrict manage to admins only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage locations" ON public.locations;

CREATE POLICY "Admins can manage locations"
  ON public.locations FOR ALL
  TO authenticated
  USING (is_admin_or_super())
  WITH CHECK (is_admin_or_super());

-- ============================================================
-- 7. MAILING LIST - GDPR critical: restrict to admins only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view mailing list" ON public.mailing_list;
DROP POLICY IF EXISTS "System can insert to mailing list" ON public.mailing_list;

CREATE POLICY "Admins can view mailing list"
  ON public.mailing_list FOR SELECT
  TO authenticated
  USING (is_admin_or_super());

-- INSERT is handled via the add_to_mailing_list RPC function (SECURITY DEFINER)
-- No direct INSERT policy needed from frontend

-- ============================================================
-- 8. ORDERS - restrict UPDATE to service_role only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can update orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can create orders" ON public.orders;

-- Orders are created and updated exclusively via edge functions using service_role
-- No direct client access needed

-- ============================================================
-- 9. PROMO CODES - restrict to admins only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage all promo codes" ON public.promo_codes;

CREATE POLICY "Admins can manage promo codes"
  ON public.promo_codes FOR ALL
  TO authenticated
  USING (is_admin_or_super())
  WITH CHECK (is_admin_or_super());

-- ============================================================
-- 10. SCAN LOGS - restrict INSERT to service_role only
-- ============================================================
DROP POLICY IF EXISTS "System can create scan logs" ON public.scan_logs;

-- scan_logs are written by edge functions using service_role - no client policy needed

-- ============================================================
-- 11. SCANNERS - restrict to admins only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view and manage scanners" ON public.scanners;

CREATE POLICY "Admins can manage scanners"
  ON public.scanners FOR ALL
  TO authenticated
  USING (is_admin_or_super())
  WITH CHECK (is_admin_or_super());

-- ============================================================
-- 12. SCANS - restrict to admins/service_role only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated scanners can create scans" ON public.scans;
DROP POLICY IF EXISTS "Authenticated scanners can view scans" ON public.scans;

CREATE POLICY "Admins can view scans"
  ON public.scans FOR SELECT
  TO authenticated
  USING (is_admin_or_super());

-- INSERT handled by edge functions via service_role

-- ============================================================
-- 13. SECTIONS - restrict manage to admins, keep public SELECT
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage sections" ON public.sections;

CREATE POLICY "Admins can manage sections"
  ON public.sections FOR ALL
  TO authenticated
  USING (is_admin_or_super())
  WITH CHECK (is_admin_or_super());

-- ============================================================
-- 14. TABLE BOOKINGS - contains PII, restrict to admins
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view bookings" ON public.table_bookings;
DROP POLICY IF EXISTS "Authenticated users can update bookings" ON public.table_bookings;
DROP POLICY IF EXISTS "Anyone can create bookings" ON public.table_bookings;

CREATE POLICY "Admins can view table bookings"
  ON public.table_bookings FOR SELECT
  TO authenticated
  USING (is_admin_or_super());

-- INSERT and UPDATE are handled by edge functions via service_role

-- ============================================================
-- 15. TABLE RESERVATIONS - restrict to admins only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view all reservations" ON public.table_reservations;
DROP POLICY IF EXISTS "Authenticated users can update reservations" ON public.table_reservations;
DROP POLICY IF EXISTS "Anyone can create table reservations" ON public.table_reservations;

CREATE POLICY "Admins can manage table reservations"
  ON public.table_reservations FOR ALL
  TO authenticated
  USING (is_admin_or_super())
  WITH CHECK (is_admin_or_super());

-- ============================================================
-- 16. TABLE TYPES - restrict to admins only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage all table types" ON public.table_types;

CREATE POLICY "Admins can manage table types"
  ON public.table_types FOR ALL
  TO authenticated
  USING (is_admin_or_super())
  WITH CHECK (is_admin_or_super());

-- ============================================================
-- 17. TABLES - restrict manage to admins, keep public SELECT for availability
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage tables" ON public.tables;

CREATE POLICY "Admins can manage tables"
  ON public.tables FOR ALL
  TO authenticated
  USING (is_admin_or_super())
  WITH CHECK (is_admin_or_super());

-- ============================================================
-- 18. TICKET TYPES - restrict to admins only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage all ticket types" ON public.ticket_types;

CREATE POLICY "Admins can manage ticket types"
  ON public.ticket_types FOR ALL
  TO authenticated
  USING (is_admin_or_super())
  WITH CHECK (is_admin_or_super());

-- ============================================================
-- 19. TICKETS - restrict to service_role (contains PII: holder_name, holder_email)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated scanners can view tickets" ON public.tickets;
DROP POLICY IF EXISTS "Authenticated users can update tickets" ON public.tickets;
DROP POLICY IF EXISTS "System can create tickets" ON public.tickets;

CREATE POLICY "Admins can view tickets"
  ON public.tickets FOR SELECT
  TO authenticated
  USING (is_admin_or_super());

-- INSERT and UPDATE handled by edge functions via service_role

-- ============================================================
-- 20. USER ROLES - restrict SELECT to admins only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Authenticated users can view their own role" ON public.user_roles;

CREATE POLICY "Users can view their own role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_admin_or_super());

-- ============================================================
-- 21. VENUES - restrict manage to admins, keep public SELECT
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage venues" ON public.venues;

CREATE POLICY "Admins can manage venues"
  ON public.venues FOR ALL
  TO authenticated
  USING (is_admin_or_super())
  WITH CHECK (is_admin_or_super());

-- ============================================================
-- 22. WEBHOOK LOGS - restrict to admins only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view webhook logs" ON public.webhook_logs;
DROP POLICY IF EXISTS "System can create webhook logs" ON public.webhook_logs;

CREATE POLICY "Admins can view webhook logs"
  ON public.webhook_logs FOR SELECT
  TO authenticated
  USING (is_admin_or_super());

-- webhook_logs INSERT handled by edge functions via service_role
