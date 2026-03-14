/*
  # Add remaining_display_threshold to ticket_types

  ## Problem
  SuperAdmin.tsx and Tickets.tsx reference ticket_types.remaining_display_threshold
  but this column doesn't exist, causing PostgREST schema cache errors.

  ## Change
  - `remaining_display_threshold` (integer, nullable) - show remaining tickets count
    only when remaining is below this threshold. NULL = always show.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ticket_types' AND column_name = 'remaining_display_threshold') THEN
    ALTER TABLE public.ticket_types ADD COLUMN remaining_display_threshold integer;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
