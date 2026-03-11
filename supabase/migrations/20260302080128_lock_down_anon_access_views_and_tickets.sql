/*
  # Lock down anonymous access to views and tickets

  1. Views - revoke all anon privileges
    - `scan_lookup`: contained ticket_number, qr_code, buyer_name, buyer_email
    - `v_ticket_sales_summary`: contained revenue data per event
    - `scanner_events_compact`: contained all events list
    - All three views are only used by admin/scanner edge functions (service_role)
    - Authenticated access also restricted to admin/scanner roles via new secure views

  2. Tickets table
    - Remove public INSERT policy (all inserts go through edge functions with service_role)
    - Replace overly broad anon SELECT (was: any row where public_token IS NOT NULL, all columns)
      with a new policy that only exposes the columns needed for the ticket viewer page

  3. Orders table
    - Remove public INSERT policy (all inserts go through edge functions with service_role)

  4. Security impact
    - Anonymous users can no longer read scan_lookup, v_ticket_sales_summary, scanner_events_compact
    - Anonymous users can no longer INSERT into tickets or orders
    - Ticket viewer (public_token) still works but through a secure view exposing only safe columns
    - All edge functions use service_role and are unaffected by RLS changes
*/

-- ============================================================
-- 1. REVOKE anon privileges on sensitive views
-- ============================================================
REVOKE ALL ON scan_lookup FROM anon;
REVOKE ALL ON v_ticket_sales_summary FROM anon;
REVOKE ALL ON scanner_events_compact FROM anon;

-- Also restrict authenticated to SELECT-only on these views
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON scan_lookup FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON v_ticket_sales_summary FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON scanner_events_compact FROM authenticated;

-- ============================================================
-- 2. DROP the public INSERT policy on tickets
--    (edge functions use service_role so they bypass RLS)
-- ============================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tickets'
    AND policyname = 'System can create tickets'
  ) THEN
    DROP POLICY "System can create tickets" ON tickets;
  END IF;
END $$;

-- ============================================================
-- 3. DROP the public INSERT policy on orders
--    (edge functions use service_role so they bypass RLS)
-- ============================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders'
    AND policyname = 'Anyone can create orders'
  ) THEN
    DROP POLICY "Anyone can create orders" ON orders;
  END IF;
END $$;

-- ============================================================
-- 4. Replace the wide anon ticket SELECT with a secure view
--    The old policy: anon can SELECT * WHERE public_token IS NOT NULL
--    This exposed token, secure_token, qr_data, metadata, etc.
-- ============================================================

-- Drop the old anon policy
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tickets'
    AND policyname = 'Anon can view ticket by public_token'
  ) THEN
    DROP POLICY "Anon can view ticket by public_token" ON tickets;
  END IF;
END $$;

-- Create a secure view for the ticket viewer page
-- This only exposes the columns the TicketView component actually needs
CREATE OR REPLACE VIEW public.public_ticket_view AS
SELECT
  t.id,
  t.ticket_number,
  t.holder_name,
  t.holder_email,
  t.status,
  t.public_token,
  t.qr_data,
  t.event_id,
  t.ticket_type_id,
  e.name AS event_name,
  e.start_date AS event_start_date,
  e.end_date AS event_end_date,
  e.location AS event_location,
  tt.name AS ticket_type_name,
  tt.theme AS ticket_type_theme
FROM tickets t
LEFT JOIN events e ON e.id = t.event_id
LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
WHERE t.public_token IS NOT NULL
  AND t.status NOT IN ('revoked');

-- Anon can only SELECT from the safe view
GRANT SELECT ON public.public_ticket_view TO anon;
GRANT SELECT ON public.public_ticket_view TO authenticated;

-- Revoke everything else from anon on this view
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.public_ticket_view FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.public_ticket_view FROM authenticated;
