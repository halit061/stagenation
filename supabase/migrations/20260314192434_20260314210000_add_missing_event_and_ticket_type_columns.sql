/*
  # Add missing columns to events and ticket_types tables

  ## Problem
  The frontend (SuperAdmin.tsx, Tickets.tsx, etc.) references columns that don't
  exist in the database, causing PostgREST schema cache errors:
  - "Could not find the 'color' column of 'ticket_types' in the schema cache"
  - "Could not find the 'floorplan_enabled' column of 'events' in the schema cache"

  ## New Columns Added

  ### events table
  - `floorplan_enabled` (boolean, default false) - show interactive floor plan
  - `service_fee_enabled` (boolean, default false) - add service fee to tickets
  - `service_fee_amount` (integer, default 0) - service fee in cents
  - `poster_url` (text, nullable) - full-size event poster image URL
  - `poster_thumb_url` (text, nullable) - thumbnail event poster image URL

  ### ticket_types table
  - `color` (text, nullable) - hex color code for ticket card border
  - `theme` (jsonb, nullable) - full theme object for ticket card styling
  - `phase_group` (text, default '') - grouping identifier for sales phases
  - `phase_order` (integer, default 0) - sort order within phase group
  - `show_remaining_tickets` (boolean, default false) - display remaining count

  ## Safety
  All additions use IF NOT EXISTS checks. No existing data is modified.
*/

-- events: add missing columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'floorplan_enabled') THEN
    ALTER TABLE public.events ADD COLUMN floorplan_enabled boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'service_fee_enabled') THEN
    ALTER TABLE public.events ADD COLUMN service_fee_enabled boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'service_fee_amount') THEN
    ALTER TABLE public.events ADD COLUMN service_fee_amount integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'poster_url') THEN
    ALTER TABLE public.events ADD COLUMN poster_url text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'poster_thumb_url') THEN
    ALTER TABLE public.events ADD COLUMN poster_thumb_url text;
  END IF;
END $$;

-- ticket_types: add missing columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ticket_types' AND column_name = 'color') THEN
    ALTER TABLE public.ticket_types ADD COLUMN color text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ticket_types' AND column_name = 'theme') THEN
    ALTER TABLE public.ticket_types ADD COLUMN theme jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ticket_types' AND column_name = 'phase_group') THEN
    ALTER TABLE public.ticket_types ADD COLUMN phase_group text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ticket_types' AND column_name = 'phase_order') THEN
    ALTER TABLE public.ticket_types ADD COLUMN phase_order integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ticket_types' AND column_name = 'show_remaining_tickets') THEN
    ALTER TABLE public.ticket_types ADD COLUMN show_remaining_tickets boolean DEFAULT false;
  END IF;
END $$;

-- Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
