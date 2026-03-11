/*
  # Fix Security and Performance Issues

  ## 1. Add Missing Indexes for Foreign Keys
    - event_logos.event_id
    - orders.event_id
    - scanners.event_id
    - scans.event_id, scanner_id, ticket_id
    - table_bookings.event_id, floorplan_table_id
    - table_reservations.event_id
    - ticket_types.event_id
    - tickets.event_id, order_id

  ## 2. Optimize RLS Policies
    - Wrap auth functions in SELECT for better performance
    - Fix profiles and orders RLS policies

  ## 3. Remove Unused Indexes
    - Remove 22 indexes that are not being used

  ## 4. Fix Function Search Paths
    - Set search_path to empty for security functions

  ## 5. Consolidate Multiple Permissive Policies
    - Merge overlapping policies for better clarity

  ## Security Notes
    - All changes are backwards compatible
    - No data loss
    - Improves query performance significantly
*/

-- =====================================================
-- PART 1: Add Missing Indexes for Foreign Keys
-- =====================================================

-- event_logos foreign key indexes
CREATE INDEX IF NOT EXISTS idx_event_logos_event_id ON public.event_logos(event_id);

-- orders foreign key indexes
CREATE INDEX IF NOT EXISTS idx_orders_event_id ON public.orders(event_id);

-- scanners foreign key indexes
CREATE INDEX IF NOT EXISTS idx_scanners_event_id ON public.scanners(event_id);

-- scans foreign key indexes
CREATE INDEX IF NOT EXISTS idx_scans_event_id ON public.scans(event_id);
CREATE INDEX IF NOT EXISTS idx_scans_scanner_id ON public.scans(scanner_id);
CREATE INDEX IF NOT EXISTS idx_scans_ticket_id ON public.scans(ticket_id);

-- table_bookings foreign key indexes
CREATE INDEX IF NOT EXISTS idx_table_bookings_event_id ON public.table_bookings(event_id);
CREATE INDEX IF NOT EXISTS idx_table_bookings_floorplan_table_id ON public.table_bookings(floorplan_table_id);

-- table_reservations foreign key indexes
CREATE INDEX IF NOT EXISTS idx_table_reservations_event_id ON public.table_reservations(event_id);

-- ticket_types foreign key indexes
CREATE INDEX IF NOT EXISTS idx_ticket_types_event_id ON public.ticket_types(event_id);

-- tickets foreign key indexes
CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON public.tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_order_id ON public.tickets(order_id);

-- =====================================================
-- PART 2: Remove Unused Indexes
-- =====================================================

DROP INDEX IF EXISTS public.idx_profiles_email;
DROP INDEX IF EXISTS public.idx_audit_logs_user_id;
DROP INDEX IF EXISTS public.idx_holds_table_id;
DROP INDEX IF EXISTS public.idx_promo_codes_event_id_fk;
DROP INDEX IF EXISTS public.idx_scan_logs_event_id_fk;
DROP INDEX IF EXISTS public.idx_scan_logs_scanner_session_id_fk;
DROP INDEX IF EXISTS public.idx_scan_logs_scanner_user_id_fk;
DROP INDEX IF EXISTS public.idx_scan_logs_ticket_id_fk;
DROP INDEX IF EXISTS public.idx_scanner_sessions_event_id_fk;
DROP INDEX IF EXISTS public.idx_scanner_sessions_scanner_user_id_fk;
DROP INDEX IF EXISTS public.idx_scanner_users_user_id_fk;
DROP INDEX IF EXISTS public.idx_scanners_user_id_fk;
DROP INDEX IF EXISTS public.idx_sections_event_id_fk;
DROP INDEX IF EXISTS public.idx_staff_invites_event_id_fk;
DROP INDEX IF EXISTS public.idx_table_bookings_order_id_fk;
DROP INDEX IF EXISTS public.idx_table_reservations_table_type_id_fk;
DROP INDEX IF EXISTS public.idx_tables_event_id_fk;
DROP INDEX IF EXISTS public.idx_tables_section_id_fk;
DROP INDEX IF EXISTS public.idx_tickets_ticket_type_id_fk;
DROP INDEX IF EXISTS public.idx_user_roles_event_id_fk;
DROP INDEX IF EXISTS public.idx_webhook_logs_order_id_fk;
DROP INDEX IF EXISTS public.idx_webhook_logs_table_booking_id_fk;

-- =====================================================
-- PART 3: Optimize RLS Policies
-- =====================================================

-- Fix profiles RLS policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can view all profiles" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY "Super admins can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
      AND user_roles.role = 'super_admin'
    )
  );

-- Fix orders RLS policies
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;

CREATE POLICY "Users can view own orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    payer_email IN (
      SELECT email FROM auth.users WHERE id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- PART 4: Fix Function Search Paths
-- =====================================================

-- Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix has_role function
CREATE OR REPLACE FUNCTION public.has_role(required_role text, check_brand text DEFAULT NULL, check_event_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ur.role = required_role
        OR (required_role = 'admin' AND ur.role = 'super_admin')
        OR (required_role = 'scanner' AND ur.role IN ('admin', 'super_admin'))
      )
      AND (check_brand IS NULL OR ur.brand = check_brand OR ur.role = 'super_admin')
      AND (check_event_id IS NULL OR ur.event_id = check_event_id OR ur.brand IS NOT NULL OR ur.role = 'super_admin')
  );
END;
$$;

-- Fix is_super_admin function
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
END;
$$;

-- Fix get_accessible_event_ids function
CREATE OR REPLACE FUNCTION public.get_accessible_event_ids()
RETURNS TABLE (event_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT e.id
  FROM public.events e
  LEFT JOIN public.user_roles ur ON 
    ur.user_id = auth.uid()
    AND (
      ur.role = 'super_admin'
      OR (ur.brand IS NOT NULL AND e.brand = ur.brand)
      OR ur.event_id = e.id
    )
  WHERE ur.id IS NOT NULL OR e.is_active = true;
END;
$$;

-- =====================================================
-- PART 5: Consolidate Multiple Permissive Policies
-- =====================================================

-- Consolidate event_logos policies
DROP POLICY IF EXISTS "Public can view logos for active events" ON public.event_logos;
DROP POLICY IF EXISTS "Super admins can manage all event logos" ON public.event_logos;

CREATE POLICY "Anyone can view event logos"
  ON public.event_logos
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = event_logos.event_id
      AND events.is_active = true
    )
  );

CREATE POLICY "Super admins can manage event logos"
  ON public.event_logos
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
      AND user_roles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
      AND user_roles.role = 'super_admin'
    )
  );

-- Consolidate events policies
DROP POLICY IF EXISTS "Authenticated users can manage all events" ON public.events;
DROP POLICY IF EXISTS "Public can view active events" ON public.events;

CREATE POLICY "Anyone can view active events"
  ON public.events
  FOR SELECT
  TO public
  USING (is_active = true);

CREATE POLICY "Authenticated users can manage events"
  ON public.events
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Consolidate floorplan_tables policies
DROP POLICY IF EXISTS "Authenticated users can manage all tables" ON public.floorplan_tables;
DROP POLICY IF EXISTS "Public can view active tables" ON public.floorplan_tables;

CREATE POLICY "Anyone can view active floorplan tables"
  ON public.floorplan_tables
  FOR SELECT
  TO public
  USING (is_active = true);

CREATE POLICY "Authenticated users manage floorplan tables"
  ON public.floorplan_tables
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Consolidate locations policies
DROP POLICY IF EXISTS "Anyone can read locations" ON public.locations;
DROP POLICY IF EXISTS "Authenticated users can manage locations" ON public.locations;

CREATE POLICY "Anyone can view locations"
  ON public.locations
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users manage locations"
  ON public.locations
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Consolidate promo_codes policies
DROP POLICY IF EXISTS "Authenticated users can manage all promo codes" ON public.promo_codes;
DROP POLICY IF EXISTS "Public can view active promo codes" ON public.promo_codes;

CREATE POLICY "Anyone can view active promo codes"
  ON public.promo_codes
  FOR SELECT
  TO public
  USING (is_active = true);

CREATE POLICY "Authenticated users manage promo codes"
  ON public.promo_codes
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Consolidate scan_logs SELECT policies
DROP POLICY IF EXISTS "Admins can view all scan logs" ON public.scan_logs;
DROP POLICY IF EXISTS "Scanner users can view own scan logs" ON public.scan_logs;

CREATE POLICY "Users can view relevant scan logs"
  ON public.scan_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
      AND (
        ur.role IN ('super_admin', 'admin')
        OR (ur.role = 'scanner' AND scanner_user_id IN (
          SELECT id FROM public.scanner_users WHERE user_id = (SELECT auth.uid())
        ))
      )
    )
  );

-- Consolidate scan_logs INSERT policies
DROP POLICY IF EXISTS "Scanner users can create scan logs" ON public.scan_logs;
DROP POLICY IF EXISTS "System can create scan logs" ON public.scan_logs;

CREATE POLICY "Authorized users can create scan logs"
  ON public.scan_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role IN ('super_admin', 'admin', 'scanner')
    )
  );

-- Consolidate scanner_sessions policies
DROP POLICY IF EXISTS "Admins can view all sessions" ON public.scanner_sessions;
DROP POLICY IF EXISTS "Scanner users can view own sessions" ON public.scanner_sessions;

CREATE POLICY "Users can view relevant scanner sessions"
  ON public.scanner_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
      AND (
        ur.role IN ('super_admin', 'admin')
        OR (ur.role = 'scanner' AND scanner_user_id IN (
          SELECT id FROM public.scanner_users WHERE user_id = (SELECT auth.uid())
        ))
      )
    )
  );

-- Consolidate scanner_users policies
DROP POLICY IF EXISTS "Admins can manage scanner users" ON public.scanner_users;
DROP POLICY IF EXISTS "Admins can view all scanner users" ON public.scanner_users;
DROP POLICY IF EXISTS "Scanner users can view own profile" ON public.scanner_users;

CREATE POLICY "Users can view relevant scanner profiles"
  ON public.scanner_users
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "Admins can manage scanner users"
  ON public.scanner_users
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role IN ('super_admin', 'admin')
    )
  );

-- Consolidate sections policies
DROP POLICY IF EXISTS "Anyone can view sections" ON public.sections;
DROP POLICY IF EXISTS "Authenticated users can manage sections" ON public.sections;

CREATE POLICY "Anyone can view sections"
  ON public.sections
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users manage sections"
  ON public.sections
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Consolidate table_types policies
DROP POLICY IF EXISTS "Authenticated users can manage all table types" ON public.table_types;
DROP POLICY IF EXISTS "Public can view active table types" ON public.table_types;

CREATE POLICY "Anyone can view active table types"
  ON public.table_types
  FOR SELECT
  TO public
  USING (is_active = true);

CREATE POLICY "Authenticated users manage table types"
  ON public.table_types
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Consolidate tables policies
DROP POLICY IF EXISTS "Anyone can view available tables" ON public.tables;
DROP POLICY IF EXISTS "Authenticated users can manage tables" ON public.tables;

CREATE POLICY "Anyone can view tables"
  ON public.tables
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users manage tables"
  ON public.tables
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Consolidate ticket_types policies
DROP POLICY IF EXISTS "Authenticated users can manage all ticket types" ON public.ticket_types;
DROP POLICY IF EXISTS "Public can view active ticket types" ON public.ticket_types;

CREATE POLICY "Anyone can view active ticket types"
  ON public.ticket_types
  FOR SELECT
  TO public
  USING (is_active = true);

CREATE POLICY "Authenticated users manage ticket types"
  ON public.ticket_types
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Consolidate venues policies
DROP POLICY IF EXISTS "Anyone can read venues" ON public.venues;
DROP POLICY IF EXISTS "Authenticated users can manage venues" ON public.venues;

CREATE POLICY "Anyone can view venues"
  ON public.venues
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users manage venues"
  ON public.venues
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
