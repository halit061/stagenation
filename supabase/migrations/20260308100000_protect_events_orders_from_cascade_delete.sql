-- ============================================================================
-- SECURITY FIX: Replace CASCADE DELETE with RESTRICT on critical tables
-- ============================================================================
-- Problem: If someone runs DELETE FROM events, ALL related data
--          (orders, tickets, ticket_orders, etc.) would be cascade-deleted.
-- Fix:     Change ON DELETE CASCADE → ON DELETE RESTRICT for critical FKs.
--          This means PostgreSQL will BLOCK any attempt to delete an event
--          that has orders, tickets, or other dependent data.
--
-- The admin panel already uses soft-delete (is_active = false), so this
-- migration only adds a database-level safety net.
-- ============================================================================

-- Helper: Drop a FK constraint if it exists, then recreate with RESTRICT
-- PostgreSQL auto-generates FK names as: {table}_{column}_fkey

-- ============================================================================
-- 1. CRITICAL TABLES: event_id → events(id) — change to RESTRICT
-- ============================================================================

-- orders (MOST CRITICAL - contains payment/financial data)
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_event_id_fkey,
  ADD CONSTRAINT orders_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;

-- ticket_types
ALTER TABLE public.ticket_types
  DROP CONSTRAINT IF EXISTS ticket_types_event_id_fkey,
  ADD CONSTRAINT ticket_types_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;

-- tickets
ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_event_id_fkey,
  ADD CONSTRAINT tickets_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;

-- ticket_orders
ALTER TABLE public.ticket_orders
  DROP CONSTRAINT IF EXISTS ticket_orders_event_id_fkey,
  ADD CONSTRAINT ticket_orders_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;

-- scans
ALTER TABLE public.scans
  DROP CONSTRAINT IF EXISTS scans_event_id_fkey,
  ADD CONSTRAINT scans_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;

-- scanners
ALTER TABLE public.scanners
  DROP CONSTRAINT IF EXISTS scanners_event_id_fkey,
  ADD CONSTRAINT scanners_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;

-- promo_codes
ALTER TABLE public.promo_codes
  DROP CONSTRAINT IF EXISTS promo_codes_event_id_fkey,
  ADD CONSTRAINT promo_codes_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;

-- sections
ALTER TABLE public.sections
  DROP CONSTRAINT IF EXISTS sections_event_id_fkey,
  ADD CONSTRAINT sections_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;

-- tables
ALTER TABLE public.tables
  DROP CONSTRAINT IF EXISTS tables_event_id_fkey,
  ADD CONSTRAINT tables_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;

-- table_bookings
ALTER TABLE public.table_bookings
  DROP CONSTRAINT IF EXISTS table_bookings_event_id_fkey,
  ADD CONSTRAINT table_bookings_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;

-- table_reservations (if exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'table_reservations' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.table_reservations DROP CONSTRAINT IF EXISTS table_reservations_event_id_fkey';
    EXECUTE 'ALTER TABLE public.table_reservations ADD CONSTRAINT table_reservations_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT';
  END IF;
END $$;

-- scanner_sessions
ALTER TABLE public.scanner_sessions
  DROP CONSTRAINT IF EXISTS scanner_sessions_event_id_fkey,
  ADD CONSTRAINT scanner_sessions_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;

-- scan_logs
ALTER TABLE public.scan_logs
  DROP CONSTRAINT IF EXISTS scan_logs_event_id_fkey,
  ADD CONSTRAINT scan_logs_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;

-- event_logos
ALTER TABLE public.event_logos
  DROP CONSTRAINT IF EXISTS event_logos_event_id_fkey,
  ADD CONSTRAINT event_logos_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;

-- drink_orders
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'drink_orders' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.drink_orders DROP CONSTRAINT IF EXISTS drink_orders_event_id_fkey';
    EXECUTE 'ALTER TABLE public.drink_orders ADD CONSTRAINT drink_orders_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT';
  END IF;
END $$;

-- drink_stock
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'drink_stock' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.drink_stock DROP CONSTRAINT IF EXISTS drink_stock_event_id_fkey';
    EXECUTE 'ALTER TABLE public.drink_stock ADD CONSTRAINT drink_stock_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT';
  END IF;
END $$;

-- event_drink_menus
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'event_drink_menus' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.event_drink_menus DROP CONSTRAINT IF EXISTS event_drink_menus_event_id_fkey';
    EXECUTE 'ALTER TABLE public.event_drink_menus ADD CONSTRAINT event_drink_menus_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT';
  END IF;
END $$;

-- guest_ticket_orders (if exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'guest_ticket_orders' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.guest_ticket_orders DROP CONSTRAINT IF EXISTS guest_ticket_orders_event_id_fkey';
    EXECUTE 'ALTER TABLE public.guest_ticket_orders ADD CONSTRAINT guest_ticket_orders_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT';
  END IF;
END $$;

-- guest_tickets (if exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'guest_tickets' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.guest_tickets DROP CONSTRAINT IF EXISTS guest_tickets_event_id_fkey';
    EXECUTE 'ALTER TABLE public.guest_tickets ADD CONSTRAINT guest_tickets_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT';
  END IF;
END $$;

-- guest_ticket_qrs
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'guest_ticket_qrs' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.guest_ticket_qrs DROP CONSTRAINT IF EXISTS guest_ticket_qrs_event_id_fkey';
    EXECUTE 'ALTER TABLE public.guest_ticket_qrs ADD CONSTRAINT guest_ticket_qrs_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT';
  END IF;
END $$;

-- table_guests
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'table_guests' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.table_guests DROP CONSTRAINT IF EXISTS table_guests_event_id_fkey';
    EXECUTE 'ALTER TABLE public.table_guests ADD CONSTRAINT table_guests_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT';
  END IF;
END $$;

-- table_packages
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'table_packages' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.table_packages DROP CONSTRAINT IF EXISTS table_packages_event_id_fkey';
    EXECUTE 'ALTER TABLE public.table_packages ADD CONSTRAINT table_packages_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT';
  END IF;
END $$;

-- visual_standing_tables
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'visual_standing_tables' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.visual_standing_tables DROP CONSTRAINT IF EXISTS visual_standing_tables_event_id_fkey';
    EXECUTE 'ALTER TABLE public.visual_standing_tables ADD CONSTRAINT visual_standing_tables_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT';
  END IF;
END $$;

-- floorplan_objects
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'floorplan_objects' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.floorplan_objects DROP CONSTRAINT IF EXISTS floorplan_objects_event_id_fkey';
    EXECUTE 'ALTER TABLE public.floorplan_objects ADD CONSTRAINT floorplan_objects_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT';
  END IF;
END $$;

-- event_entrances
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'event_entrances' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.event_entrances DROP CONSTRAINT IF EXISTS event_entrances_event_id_fkey';
    EXECUTE 'ALTER TABLE public.event_entrances ADD CONSTRAINT event_entrances_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT';
  END IF;
END $$;

-- reservation_timers
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reservation_timers' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.reservation_timers DROP CONSTRAINT IF EXISTS reservation_timers_event_id_fkey';
    EXECUTE 'ALTER TABLE public.reservation_timers ADD CONSTRAINT reservation_timers_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT';
  END IF;
END $$;

-- refund_protection_orders (event_id)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'refund_protection_orders' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.refund_protection_orders DROP CONSTRAINT IF EXISTS refund_protection_orders_event_id_fkey';
    EXECUTE 'ALTER TABLE public.refund_protection_orders ADD CONSTRAINT refund_protection_orders_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT';
  END IF;
END $$;

-- venue_zones
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'venue_zones' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.venue_zones DROP CONSTRAINT IF EXISTS venue_zones_event_id_fkey';
    EXECUTE 'ALTER TABLE public.venue_zones ADD CONSTRAINT venue_zones_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT';
  END IF;
END $$;

-- user_roles (event_id)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_roles' AND column_name = 'event_id' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_event_id_fkey';
    EXECUTE 'ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT';
  END IF;
END $$;

-- staff_invites (event_id)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'staff_invites' AND column_name = 'event_id' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.staff_invites DROP CONSTRAINT IF EXISTS staff_invites_event_id_fkey';
    EXECUTE 'ALTER TABLE public.staff_invites ADD CONSTRAINT staff_invites_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT';
  END IF;
END $$;

-- ============================================================================
-- 2. CRITICAL TABLES: order_id → orders(id) — change to RESTRICT
-- ============================================================================

-- tickets.order_id
ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_order_id_fkey,
  ADD CONSTRAINT tickets_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;

-- email_logs.order_id
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_logs' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.email_logs DROP CONSTRAINT IF EXISTS email_logs_order_id_fkey';
    EXECUTE 'ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT';
  END IF;
END $$;

-- table_bookings.order_id
ALTER TABLE public.table_bookings
  DROP CONSTRAINT IF EXISTS table_bookings_order_id_fkey,
  ADD CONSTRAINT table_bookings_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;

-- guest_ticket_qrs.order_id
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'guest_ticket_qrs' AND column_name = 'order_id' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.guest_ticket_qrs DROP CONSTRAINT IF EXISTS guest_ticket_qrs_order_id_fkey';
    EXECUTE 'ALTER TABLE public.guest_ticket_qrs ADD CONSTRAINT guest_ticket_qrs_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT';
  END IF;
END $$;

-- refund_protection_orders.order_id
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'refund_protection_orders' AND column_name = 'order_id' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.refund_protection_orders DROP CONSTRAINT IF EXISTS refund_protection_orders_order_id_fkey';
    EXECUTE 'ALTER TABLE public.refund_protection_orders ADD CONSTRAINT refund_protection_orders_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT';
  END IF;
END $$;

-- ============================================================================
-- 3. ticket_types and ticket_orders — change to RESTRICT
-- ============================================================================

-- tickets.ticket_type_id → ticket_types(id)
ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_ticket_type_id_fkey,
  ADD CONSTRAINT tickets_ticket_type_id_fkey
    FOREIGN KEY (ticket_type_id) REFERENCES public.ticket_types(id) ON DELETE RESTRICT;

-- ticket_order_items.ticket_order_id → ticket_orders(id)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ticket_order_items' AND table_schema = 'public') THEN
    EXECUTE 'ALTER TABLE public.ticket_order_items DROP CONSTRAINT IF EXISTS ticket_order_items_ticket_order_id_fkey';
    EXECUTE 'ALTER TABLE public.ticket_order_items ADD CONSTRAINT ticket_order_items_ticket_order_id_fkey FOREIGN KEY (ticket_order_id) REFERENCES public.ticket_orders(id) ON DELETE RESTRICT';
  END IF;
END $$;

-- ============================================================================
-- 4. EXTRA SAFETY: Prevent direct DELETE on events table via RLS
-- ============================================================================

-- Add a policy that prevents ALL deletes on events (even for authenticated users)
-- Only way to "delete" an event is to set is_active = false (soft delete)
DO $$ BEGIN
  -- Drop existing delete policies if any
  DROP POLICY IF EXISTS "prevent_event_deletion" ON public.events;

  -- Create a policy that blocks all deletes
  CREATE POLICY "prevent_event_deletion" ON public.events
    FOR DELETE
    USING (false);  -- No row can ever match → deletes always blocked
END $$;

-- ============================================================================
-- Done! Now:
-- - DELETE FROM events → blocked by RLS policy (returns 0 rows)
-- - Even if RLS bypassed (service role), FK RESTRICT prevents deletion
--   if any orders, tickets, etc. reference the event
-- - Admin panel soft-delete (is_active = false) continues to work normally
-- ============================================================================
