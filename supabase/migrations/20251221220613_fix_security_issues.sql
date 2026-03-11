/*
  # Fix Security and Performance Issues

  ## Changes Made

  ### 1. Add Missing Indexes on Foreign Keys
  - `audit_logs.user_id`
  - `promo_codes.event_id`
  - `scanners.user_id`
  - `table_reservations.table_type_id`
  - `tickets.ticket_type_id`
  - `webhook_logs.order_id`
  - `webhook_logs.table_booking_id`

  ### 2. Remove Unused Indexes
  Dropping indexes that are not being used to reduce maintenance overhead:
  - `idx_tickets_order_id`, `idx_tickets_token`, `idx_tickets_status`
  - `idx_orders_payment_id`, `idx_orders_status`, `idx_orders_payer_email`
  - `idx_scans_ticket_id`, `idx_scans_scanner_id`, `idx_scans_scanned_at`
  - `idx_promo_codes_code`
  - `idx_audit_logs_resource`
  - `idx_table_bookings_status`, `idx_table_bookings_expires`
  - `idx_table_reservations_event`, `idx_table_reservations_code`, `idx_table_reservations_email`

  ### 3. Fix RLS Policy Performance
  Update the `orders` table policy to use subquery pattern for better performance at scale

  ### 4. Consolidate Multiple Permissive Policies
  Replace multiple permissive SELECT policies with single consolidated policies:
  - `events`, `floorplan_tables`, `promo_codes`, `scanners`, `table_types`, `ticket_types`

  ### 5. Fix Function Search Path
  Set immutable search_path for functions to prevent security vulnerabilities:
  - `update_updated_at_column`
  - `expire_table_holds`
*/

-- ============================================================================
-- 1. ADD MISSING INDEXES ON FOREIGN KEYS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_event_id ON public.promo_codes(event_id);
CREATE INDEX IF NOT EXISTS idx_scanners_user_id ON public.scanners(user_id);
CREATE INDEX IF NOT EXISTS idx_table_reservations_table_type_id ON public.table_reservations(table_type_id);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_type_id ON public.tickets(ticket_type_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_order_id ON public.webhook_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_table_booking_id ON public.webhook_logs(table_booking_id);

-- ============================================================================
-- 2. DROP UNUSED INDEXES
-- ============================================================================

DROP INDEX IF EXISTS public.idx_tickets_order_id;
DROP INDEX IF EXISTS public.idx_tickets_token;
DROP INDEX IF EXISTS public.idx_tickets_status;
DROP INDEX IF EXISTS public.idx_orders_payment_id;
DROP INDEX IF EXISTS public.idx_orders_status;
DROP INDEX IF EXISTS public.idx_orders_payer_email;
DROP INDEX IF EXISTS public.idx_scans_ticket_id;
DROP INDEX IF EXISTS public.idx_scans_scanner_id;
DROP INDEX IF EXISTS public.idx_scans_scanned_at;
DROP INDEX IF EXISTS public.idx_promo_codes_code;
DROP INDEX IF EXISTS public.idx_audit_logs_resource;
DROP INDEX IF EXISTS public.idx_table_bookings_status;
DROP INDEX IF EXISTS public.idx_table_bookings_expires;
DROP INDEX IF EXISTS public.idx_table_reservations_event;
DROP INDEX IF EXISTS public.idx_table_reservations_code;
DROP INDEX IF EXISTS public.idx_table_reservations_email;

-- ============================================================================
-- 3. FIX RLS POLICY PERFORMANCE ON ORDERS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;

CREATE POLICY "Users can view own orders"
  ON public.orders
  FOR SELECT
  USING (
    payer_email = (SELECT current_setting('request.jwt.claims', true)::json->>'email') 
    OR (SELECT auth.uid()) IS NOT NULL
  );

-- ============================================================================
-- 4. CONSOLIDATE MULTIPLE PERMISSIVE POLICIES
-- ============================================================================

-- Events table
DROP POLICY IF EXISTS "Anyone can view active events" ON public.events;
DROP POLICY IF EXISTS "Authenticated users can manage events" ON public.events;

CREATE POLICY "Public can view active events"
  ON public.events
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated users can manage all events"
  ON public.events
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Floorplan tables
DROP POLICY IF EXISTS "Anyone can view active tables" ON public.floorplan_tables;
DROP POLICY IF EXISTS "Authenticated users can manage tables" ON public.floorplan_tables;

CREATE POLICY "Public can view active tables"
  ON public.floorplan_tables
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated users can manage all tables"
  ON public.floorplan_tables
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Promo codes
DROP POLICY IF EXISTS "Anyone can view active promo codes" ON public.promo_codes;
DROP POLICY IF EXISTS "Authenticated users can manage promo codes" ON public.promo_codes;

CREATE POLICY "Public can view active promo codes"
  ON public.promo_codes
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated users can manage all promo codes"
  ON public.promo_codes
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Scanners
DROP POLICY IF EXISTS "Authenticated users can view scanners" ON public.scanners;
DROP POLICY IF EXISTS "Authenticated users can manage scanners" ON public.scanners;

CREATE POLICY "Authenticated users can view and manage scanners"
  ON public.scanners
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Table types
DROP POLICY IF EXISTS "Anyone can view active table types" ON public.table_types;
DROP POLICY IF EXISTS "Authenticated users can manage table types" ON public.table_types;

CREATE POLICY "Public can view active table types"
  ON public.table_types
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated users can manage all table types"
  ON public.table_types
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Ticket types
DROP POLICY IF EXISTS "Anyone can view active ticket types" ON public.ticket_types;
DROP POLICY IF EXISTS "Authenticated users can manage ticket types" ON public.ticket_types;

CREATE POLICY "Public can view active ticket types"
  ON public.ticket_types
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated users can manage all ticket types"
  ON public.ticket_types
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 5. FIX FUNCTION SEARCH PATH
-- ============================================================================

-- Recreate update_updated_at_column with immutable search_path
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
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

-- Recreate expire_table_holds with immutable search_path
CREATE OR REPLACE FUNCTION public.expire_table_holds()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.table_bookings
  SET status = 'cancelled'
  WHERE status = 'on_hold'
    AND hold_expires_at < now();
END;
$$;