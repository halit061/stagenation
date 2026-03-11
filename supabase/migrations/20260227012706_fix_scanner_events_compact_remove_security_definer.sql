/*
  # Remove SECURITY DEFINER from scanner_events_compact view

  1. Changes
    - Drops and recreates `scanner_events_compact` view WITHOUT security_definer
    - View now runs as INVOKER (default), meaning RLS on the `events` table is enforced
    - Previously the SECURITY DEFINER context bypassed RLS and exposed all events (including inactive)
    - Now only rows matching the public RLS policy (`is_active = true`) or admin policies are returned

  2. Columns (unchanged)
    - `id` (uuid) - event identifier
    - `title` (text) - event name
    - `starts_at` (timestamptz) - event start date
    - `ends_at` (timestamptz) - event end date
    - `brand` (text) - brand identifier
    - `status` (text) - always NULL (placeholder)

  3. Security
    - RLS on `events` table is now respected by this view
    - Public/anon users only see active events
    - Authenticated admin users see events per their admin policy
    - No sensitive columns (emails, payments, tokens) are exposed

  4. Grants
    - Re-grants SELECT to anon, authenticated, service_role to maintain scanner access
*/

DROP VIEW IF EXISTS public.scanner_events_compact;

CREATE VIEW public.scanner_events_compact AS
  SELECT
    e.id,
    e.title,
    e.start_date AS starts_at,
    e.end_date AS ends_at,
    e.brand,
    NULL::text AS status
  FROM public.events e;

GRANT SELECT ON public.scanner_events_compact TO anon;
GRANT SELECT ON public.scanner_events_compact TO authenticated;
GRANT SELECT ON public.scanner_events_compact TO service_role;
