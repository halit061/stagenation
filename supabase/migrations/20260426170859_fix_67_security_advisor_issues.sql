/*
  # Fix all 67 Supabase Security Advisor issues

  ## Summary

  This migration resolves every issue currently flagged by the Supabase
  Security Advisor:

  1. ERRORS - SECURITY DEFINER views (2)
     - Recreates `public_ticket_view` with `security_invoker = true`
     - Recreates `seat_sections_with_counts` with `security_invoker = true`
     - Behavior preserved: same columns, same JOINs, same data shape.
       Access is now governed by the RLS of the underlying tables of the
       caller, not the view owner. All existing read paths use either the
       service role (edge functions) or already-permitted anon/auth roles
       on the base tables, so functionality stays intact.

  2. WARNING - Mutable function search_path (1)
     - `_diag_seat_order` is a leftover diagnostic helper. We pin its
       search_path to `public, pg_temp` to satisfy the advisor without
       removing it (it is harmless and may be useful for future debug).

  3. WARNING - contact_messages INSERT always-true (1)
     - Replaces the WITH CHECK (true) policy with one that enforces basic
       sanity (non-empty fields, length limits, valid email shape). The
       front-end already sends these fields, so legitimate submissions
       continue to work. This makes the policy non-trivial and silences
       the advisor while adding actual abuse protection.

  4. WARNING - Public storage buckets allow listing (2)
     - Drops the broad `bucket_id = '<bucket>'` SELECT policies on
       storage.objects for `event-images` and `floorplan-backgrounds`.
     - These buckets are marked `public = true`, so public URL access
       continues to work via Supabase's storage public endpoint (which
       bypasses RLS for public buckets). Only API-level listing is
       removed.

  5. WARNINGS - pg_graphql anon introspection (61)
     - Revokes USAGE on schema `graphql_public` from `anon` and on the
       `graphql_public.graphql` resolver function.
     - The application uses PostgREST (supabase-js default), not GraphQL,
       so revoking anon access disables the public introspection
       endpoint without affecting any feature in the app.
     - Authenticated GraphQL access remains available in case it is ever
       needed (it is not used by the current frontend or edge functions).

  ## Safety

  - No table data is modified or deleted.
  - All policy DROPs are scoped to a single specific policy name.
  - Storage bucket public-URL access is unchanged.
  - Verified the codebase has zero GraphQL imports/usage.
*/

-- ============================================================
-- 1. Fix SECURITY DEFINER views
-- ============================================================

CREATE OR REPLACE VIEW public.public_ticket_view
WITH (security_invoker = true) AS
SELECT t.id,
    t.public_token,
    t.ticket_number,
    t.holder_name,
    t.holder_email,
    t.status,
    t.qr_data,
    t.qr_code,
    t.issued_at,
    t.used_at,
    t.metadata,
    tt.name AS ticket_type_name,
    tt.theme AS ticket_type_theme,
    tt.color AS ticket_type_color,
    e.name AS event_name,
    e.start_date AS event_start_date,
    e.end_date AS event_end_date,
    e.event_start,
    e.event_end,
    e.location AS event_location,
    e.venue_name AS event_venue_name,
    e.poster_url AS event_poster_url,
    COALESCE(sec.name, gq.section_name) AS seat_section_name,
    COALESCE(s.row_label, gq.row_label) AS seat_row_label,
    COALESCE(s.seat_number, gq.seat_number) AS seat_number
FROM tickets t
LEFT JOIN ticket_types tt ON tt.id = t.ticket_type_id
LEFT JOIN events e ON e.id = t.event_id
LEFT JOIN LATERAL (
    SELECT ts2.seat_id
    FROM ticket_seats ts2
    WHERE ts2.ticket_id = t.id
    LIMIT 1
) ts_lat ON true
LEFT JOIN seats s ON s.id = ts_lat.seat_id
LEFT JOIN seat_sections sec ON sec.id = s.section_id
LEFT JOIN LATERAL (
    SELECT gqr.section_name, gqr.row_label, gqr.seat_number
    FROM guest_ticket_qrs gqr
    WHERE gqr.order_id = t.order_id AND gqr.seat_id IS NOT NULL
    LIMIT 1
) gq ON ts_lat.seat_id IS NULL
WHERE t.public_token IS NOT NULL;

CREATE OR REPLACE VIEW public.seat_sections_with_counts
WITH (security_invoker = true) AS
SELECT ss.id,
    ss.layout_id,
    ss.name,
    ss.section_type,
    ss.capacity,
    ss.color,
    ss.price_category,
    ss.price_amount,
    ss.position_x,
    ss.position_y,
    ss.width,
    ss.height,
    ss.rotation,
    ss.rows_count,
    ss.seats_per_row,
    ss.row_curve,
    ss.sort_order,
    ss.is_active,
    ss.created_at,
    ss.updated_at,
    ss.orientation,
    ss.start_row_label,
    ss.numbering_direction,
    ss.row_spacing,
    ss.seat_spacing,
    ss.row_label_direction,
    count(s.id) FILTER (WHERE s.status = 'available'::text) AS available_count,
    count(s.id) FILTER (WHERE s.status = 'blocked'::text) AS blocked_count,
    count(s.id) FILTER (WHERE s.status = 'reserved'::text) AS reserved_count,
    count(s.id) FILTER (WHERE s.status = 'sold'::text) AS sold_count,
    count(s.id) AS actual_capacity
FROM seat_sections ss
LEFT JOIN seats s ON s.section_id = ss.id
GROUP BY ss.id;

-- ============================================================
-- 2. Pin search_path on diagnostic function
-- ============================================================

ALTER FUNCTION public._diag_seat_order() SET search_path = public, pg_temp;

-- ============================================================
-- 3. Tighten contact_messages INSERT policy
-- ============================================================

DROP POLICY IF EXISTS "Anyone can insert contact messages" ON public.contact_messages;

CREATE POLICY "Anyone can insert valid contact messages"
  ON public.contact_messages FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    name IS NOT NULL
    AND length(btrim(name)) BETWEEN 1 AND 200
    AND email IS NOT NULL
    AND email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
    AND length(email) <= 320
    AND subject IS NOT NULL
    AND length(btrim(subject)) BETWEEN 1 AND 300
    AND message IS NOT NULL
    AND length(btrim(message)) BETWEEN 1 AND 5000
    AND is_read IS NOT TRUE
  );

-- ============================================================
-- 4. Remove broad listing policies on public storage buckets
-- ============================================================

DROP POLICY IF EXISTS "Public can view event images" ON storage.objects;
DROP POLICY IF EXISTS "Public can read floorplan backgrounds" ON storage.objects;

-- ============================================================
-- 5. Revoke anon access to GraphQL endpoint (kills 61 introspection warnings)
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'graphql_public') THEN
    EXECUTE 'REVOKE USAGE ON SCHEMA graphql_public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql_public FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA graphql_public REVOKE ALL ON FUNCTIONS FROM anon';
  END IF;
END $$;
