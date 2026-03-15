/*
  # Fix floorplan_objects schema and add Tribune support

  ## Summary
  The FloorPlanEditor was using column names that don't match the actual database schema.
  This migration aligns the schema with what the editor expects and adds Tribune support.

  ## Changes to floorplan_objects
  - Add `name` column (text) - main display name
  - Add `type` column (text) - object type enum (BAR, STAGE, DANCEFLOOR, etc. + TRIBUNE)
  - Add `font_color` column (text) - text color
  - Add `name_nl` / `name_tr` / `name_fr` / `name_de` columns for translations
  - `object_type` was the old column name; we keep it but also support `type`

  ## New object types
  - TRIBUNE: A seating tribune/stand area with a custom name

  ## Notes
  - All changes use IF NOT EXISTS to be safe
  - Existing data is preserved
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'floorplan_objects' AND column_name = 'name'
  ) THEN
    ALTER TABLE public.floorplan_objects ADD COLUMN name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'floorplan_objects' AND column_name = 'type'
  ) THEN
    ALTER TABLE public.floorplan_objects ADD COLUMN type text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'floorplan_objects' AND column_name = 'font_color'
  ) THEN
    ALTER TABLE public.floorplan_objects ADD COLUMN font_color text DEFAULT '#ffffff';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'floorplan_objects' AND column_name = 'name_nl'
  ) THEN
    ALTER TABLE public.floorplan_objects ADD COLUMN name_nl text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'floorplan_objects' AND column_name = 'name_tr'
  ) THEN
    ALTER TABLE public.floorplan_objects ADD COLUMN name_tr text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'floorplan_objects' AND column_name = 'name_fr'
  ) THEN
    ALTER TABLE public.floorplan_objects ADD COLUMN name_fr text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'floorplan_objects' AND column_name = 'name_de'
  ) THEN
    ALTER TABLE public.floorplan_objects ADD COLUMN name_de text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'floorplan_objects' AND column_name = 'included_text'
  ) THEN
    ALTER TABLE public.floorplan_objects ADD COLUMN included_text text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'floorplan_tables' AND column_name = 'max_guests'
  ) THEN
    ALTER TABLE public.floorplan_tables ADD COLUMN max_guests integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'floorplan_tables' AND column_name = 'included_text'
  ) THEN
    ALTER TABLE public.floorplan_tables ADD COLUMN included_text text;
  END IF;
END $$;

UPDATE public.floorplan_objects
SET 
  type = COALESCE(type, UPPER(object_type)),
  name = COALESCE(name, label, UPPER(object_type))
WHERE type IS NULL OR name IS NULL;

CREATE POLICY "Public can view active floorplan objects"
  ON public.floorplan_objects FOR SELECT
  TO anon
  USING (is_active = true AND is_visible = true);
