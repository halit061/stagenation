/*
  # Add Included Items Fields to Floorplan Tables

  ## Changes
  1. Add columns to floorplan_tables:
     - included_text (text) - Plain text description of included items
     - included_items (jsonb) - Array of included items
     - max_guests (integer) - Maximum number of guests allowed

  2. Backfill data from table_packages where relations exist

  3. Ensure public SELECT access for table reservations

  ## Notes
  - Idempotent: Uses IF NOT EXISTS checks
  - Preserves existing data
  - No breaking changes
*/

-- Add included_text column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'floorplan_tables' AND column_name = 'included_text'
  ) THEN
    ALTER TABLE floorplan_tables ADD COLUMN included_text text;
  END IF;
END $$;

-- Add included_items column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'floorplan_tables' AND column_name = 'included_items'
  ) THEN
    ALTER TABLE floorplan_tables ADD COLUMN included_items jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Add max_guests column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'floorplan_tables' AND column_name = 'max_guests'
  ) THEN
    ALTER TABLE floorplan_tables ADD COLUMN max_guests integer;
  END IF;
END $$;

-- Backfill included data from table_packages
-- Only update rows where included fields are NULL and package relation exists
UPDATE floorplan_tables ft
SET
  included_text = COALESCE(ft.included_text, tp.description),
  included_items = COALESCE(ft.included_items, tp.included_items),
  max_guests = COALESCE(ft.max_guests, tp.included_people, ft.capacity)
FROM table_packages tp
WHERE ft.package_id = tp.id
  AND ft.package_id IS NOT NULL
  AND (
    ft.included_text IS NULL
    OR ft.included_items IS NULL
    OR ft.included_items = '[]'::jsonb
    OR ft.max_guests IS NULL
  );

-- Ensure max_guests defaults to capacity if still null
UPDATE floorplan_tables
SET max_guests = capacity
WHERE max_guests IS NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_floorplan_tables_included
  ON floorplan_tables(id)
  WHERE included_items IS NOT NULL AND included_items != '[]'::jsonb;

-- Ensure public SELECT policy exists for table reservations
-- This allows anonymous users to view active tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'floorplan_tables'
    AND policyname = 'Public can view active tables'
  ) THEN
    CREATE POLICY "Public can view active tables"
      ON floorplan_tables
      FOR SELECT
      TO anon, authenticated
      USING (is_active = true);
  END IF;
END $$;

-- Ensure RLS is enabled
ALTER TABLE floorplan_tables ENABLE ROW LEVEL SECURITY;
