/*
  # Fix Database Security and Performance Issues
  
  This migration addresses multiple security and performance concerns:
  
  ## 1. Foreign Key Indexes
  Creates missing indexes on foreign key columns to improve query performance
  
  ## 2. RLS Policy Optimization
  Replaces direct auth function calls with subselects for better performance
  
  ## 3. Remove Unused Indexes
  Removes indexes that are not being used by queries
  
  ## 4. Fix Function Search Paths
  Updates functions to use immutable search_path for security
*/

-- =====================================================
-- 1. CREATE MISSING FOREIGN KEY INDEXES
-- =====================================================

-- audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);

-- holds
CREATE INDEX IF NOT EXISTS idx_holds_table_id ON public.holds(table_id);

-- promo_codes
CREATE INDEX IF NOT EXISTS idx_promo_codes_event_id_fk ON public.promo_codes(event_id);

-- scan_logs
CREATE INDEX IF NOT EXISTS idx_scan_logs_event_id_fk ON public.scan_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_scanner_session_id_fk ON public.scan_logs(scanner_session_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_scanner_user_id_fk ON public.scan_logs(scanner_user_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_ticket_id_fk ON public.scan_logs(ticket_id);

-- scanner_sessions
CREATE INDEX IF NOT EXISTS idx_scanner_sessions_event_id_fk ON public.scanner_sessions(event_id);
CREATE INDEX IF NOT EXISTS idx_scanner_sessions_scanner_user_id_fk ON public.scanner_sessions(scanner_user_id);

-- scanner_users
CREATE INDEX IF NOT EXISTS idx_scanner_users_user_id_fk ON public.scanner_users(user_id);

-- scanners
CREATE INDEX IF NOT EXISTS idx_scanners_user_id_fk ON public.scanners(user_id);

-- sections
CREATE INDEX IF NOT EXISTS idx_sections_event_id_fk ON public.sections(event_id);

-- staff_invites
CREATE INDEX IF NOT EXISTS idx_staff_invites_event_id_fk ON public.staff_invites(event_id);

-- table_bookings
CREATE INDEX IF NOT EXISTS idx_table_bookings_order_id_fk ON public.table_bookings(order_id);

-- table_reservations
CREATE INDEX IF NOT EXISTS idx_table_reservations_table_type_id_fk ON public.table_reservations(table_type_id);

-- tables
CREATE INDEX IF NOT EXISTS idx_tables_event_id_fk ON public.tables(event_id);
CREATE INDEX IF NOT EXISTS idx_tables_section_id_fk ON public.tables(section_id);

-- tickets
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_type_id_fk ON public.tickets(ticket_type_id);

-- user_roles
CREATE INDEX IF NOT EXISTS idx_user_roles_event_id_fk ON public.user_roles(event_id);

-- webhook_logs
CREATE INDEX IF NOT EXISTS idx_webhook_logs_order_id_fk ON public.webhook_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_table_booking_id_fk ON public.webhook_logs(table_booking_id);


-- =====================================================
-- 2. OPTIMIZE RLS POLICIES
-- =====================================================

-- Optimize orders policy
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
CREATE POLICY "Users can view own orders"
  ON public.orders
  FOR SELECT
  TO public
  USING (
    (payer_email = (SELECT (current_setting('request.jwt.claims'::text, true))::json ->> 'email'))
    OR (SELECT auth.uid()) IS NOT NULL
  );

-- Optimize event_logos policy
DROP POLICY IF EXISTS "Super admins can manage all event logos" ON public.event_logos;
CREATE POLICY "Super admins can manage all event logos"
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


-- =====================================================
-- 3. REMOVE UNUSED INDEXES
-- =====================================================

DROP INDEX IF EXISTS public.idx_scans_event_id;
DROP INDEX IF EXISTS public.idx_ticket_types_event_id;
DROP INDEX IF EXISTS public.idx_scanners_event_id;
DROP INDEX IF EXISTS public.idx_tickets_event_id;
DROP INDEX IF EXISTS public.idx_orders_event_id;
DROP INDEX IF EXISTS public.idx_table_bookings_event;
DROP INDEX IF EXISTS public.idx_table_bookings_table;
DROP INDEX IF EXISTS public.idx_user_roles_user_id;
DROP INDEX IF EXISTS public.idx_user_roles_role;
DROP INDEX IF EXISTS public.idx_scans_scanner_id;
DROP INDEX IF EXISTS public.idx_scans_ticket_id;
DROP INDEX IF EXISTS public.idx_table_reservations_event_id;
DROP INDEX IF EXISTS public.idx_tickets_order_id;
DROP INDEX IF EXISTS public.idx_event_logos_event_id;
DROP INDEX IF EXISTS public.idx_event_logos_display_order;


-- =====================================================
-- 4. FIX FUNCTION SEARCH PATHS
-- =====================================================

-- has_role function
CREATE OR REPLACE FUNCTION public.has_role(required_role text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = required_role
  );
END;
$$;

-- is_super_admin function
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  );
END;
$$;

-- get_accessible_event_ids function
CREATE OR REPLACE FUNCTION public.get_accessible_event_ids()
RETURNS TABLE(event_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ur.event_id
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
  AND ur.event_id IS NOT NULL
  UNION
  SELECT e.id
  FROM public.events e
  WHERE EXISTS (
    SELECT 1 FROM public.user_roles ur2
    WHERE ur2.user_id = auth.uid()
    AND ur2.role IN ('super_admin', 'admin')
    AND (ur2.event_id IS NULL OR ur2.event_id = e.id)
  );
END;
$$;

-- update_event_logos_updated_at function
CREATE OR REPLACE FUNCTION public.update_event_logos_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;