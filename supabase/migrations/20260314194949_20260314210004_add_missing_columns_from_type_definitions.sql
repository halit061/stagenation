/*
  # Add all missing columns from supabaseClient.ts type definitions

  ## Problem
  The Database type definitions in supabaseClient.ts reference columns that
  don't exist in the actual tables, causing schema cache errors.

  ## Changes

  ### events table
  - poster_updated_at (timestamptz) - when poster was last updated
  - venue_map_config (jsonb) - configuration for venue map display

  ### floorplan_tables table
  - event_id (uuid) - which event this table belongs to
  - label (text) - display label for the table
  - shape (text) - shape of the table (rect/circle/etc)
  - seats (integer) - alias/synonym for capacity
  - status (text) - current booking status
  - is_vip (boolean) - VIP table flag
  - color (text) - display color
  - package_id (uuid) - linked table package
  - included_items (jsonb) - items included with this table
  - included_people (integer) - number of people included in price

  ### table_bookings table
  - table_id (uuid) - alternative FK to floorplan_tables
  - guests (integer) - alias for number_of_guests
  - total_amount (integer) - alias for total_price (in cents)

  ### table_packages table
  - base_price (integer) - base price before extras
  - included_items (jsonb) - items included in the package
  - included_people (integer) - people included in base price
*/

-- events: missing columns from type definitions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'poster_updated_at') THEN
    ALTER TABLE public.events ADD COLUMN poster_updated_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'venue_map_config') THEN
    ALTER TABLE public.events ADD COLUMN venue_map_config jsonb DEFAULT '{}';
  END IF;
END $$;

-- floorplan_tables: missing columns from type definitions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'floorplan_tables' AND column_name = 'event_id') THEN
    ALTER TABLE public.floorplan_tables ADD COLUMN event_id uuid REFERENCES public.events(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'floorplan_tables' AND column_name = 'label') THEN
    ALTER TABLE public.floorplan_tables ADD COLUMN label text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'floorplan_tables' AND column_name = 'shape') THEN
    ALTER TABLE public.floorplan_tables ADD COLUMN shape text DEFAULT 'rect';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'floorplan_tables' AND column_name = 'seats') THEN
    ALTER TABLE public.floorplan_tables ADD COLUMN seats integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'floorplan_tables' AND column_name = 'status') THEN
    ALTER TABLE public.floorplan_tables ADD COLUMN status text DEFAULT 'available';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'floorplan_tables' AND column_name = 'is_vip') THEN
    ALTER TABLE public.floorplan_tables ADD COLUMN is_vip boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'floorplan_tables' AND column_name = 'color') THEN
    ALTER TABLE public.floorplan_tables ADD COLUMN color text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'floorplan_tables' AND column_name = 'package_id') THEN
    ALTER TABLE public.floorplan_tables ADD COLUMN package_id uuid REFERENCES public.table_packages(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'floorplan_tables' AND column_name = 'included_items') THEN
    ALTER TABLE public.floorplan_tables ADD COLUMN included_items jsonb DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'floorplan_tables' AND column_name = 'included_people') THEN
    ALTER TABLE public.floorplan_tables ADD COLUMN included_people integer;
  END IF;
END $$;

-- table_bookings: missing columns from type definitions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'table_bookings' AND column_name = 'table_id') THEN
    ALTER TABLE public.table_bookings ADD COLUMN table_id uuid REFERENCES public.floorplan_tables(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'table_bookings' AND column_name = 'guests') THEN
    ALTER TABLE public.table_bookings ADD COLUMN guests integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'table_bookings' AND column_name = 'total_amount') THEN
    ALTER TABLE public.table_bookings ADD COLUMN total_amount integer DEFAULT 0;
  END IF;
END $$;

-- table_packages: missing columns from type definitions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'table_packages' AND column_name = 'base_price') THEN
    ALTER TABLE public.table_packages ADD COLUMN base_price integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'table_packages' AND column_name = 'included_items') THEN
    ALTER TABLE public.table_packages ADD COLUMN included_items jsonb DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'table_packages' AND column_name = 'included_people') THEN
    ALTER TABLE public.table_packages ADD COLUMN included_people integer;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
