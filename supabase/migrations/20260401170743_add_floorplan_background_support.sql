/*
  # Add Floorplan Background Image Support

  1. Modified Tables
    - `venue_layouts`
      - `background_image_url` (text) - URL of the uploaded background image in Supabase Storage
      - `background_opacity` (decimal) - Transparency of the background (0.1 to 1.0, default 0.3)
      - `background_position_x` (double precision) - X position of the background on canvas (default 0)
      - `background_position_y` (double precision) - Y position of the background on canvas (default 0)
      - `background_width` (double precision) - Width of the background image on canvas
      - `background_height` (double precision) - Height of the background image on canvas
      - `background_rotation` (double precision) - Rotation of the background in degrees (default 0)
      - `background_locked` (boolean) - Whether the background is locked from accidental movement (default true)

  2. Storage
    - Creates 'floorplan-backgrounds' bucket for storing venue blueprint/floorplan images
    - Public read access for rendering in the editor
    - Authenticated upload/delete access for admins

  3. Security
    - Storage policies restrict uploads to authenticated users
    - Public read access for serving images
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venue_layouts' AND column_name = 'background_image_url'
  ) THEN
    ALTER TABLE venue_layouts ADD COLUMN background_image_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venue_layouts' AND column_name = 'background_opacity'
  ) THEN
    ALTER TABLE venue_layouts ADD COLUMN background_opacity decimal DEFAULT 0.3;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venue_layouts' AND column_name = 'background_position_x'
  ) THEN
    ALTER TABLE venue_layouts ADD COLUMN background_position_x double precision DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venue_layouts' AND column_name = 'background_position_y'
  ) THEN
    ALTER TABLE venue_layouts ADD COLUMN background_position_y double precision DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venue_layouts' AND column_name = 'background_width'
  ) THEN
    ALTER TABLE venue_layouts ADD COLUMN background_width double precision;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venue_layouts' AND column_name = 'background_height'
  ) THEN
    ALTER TABLE venue_layouts ADD COLUMN background_height double precision;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venue_layouts' AND column_name = 'background_rotation'
  ) THEN
    ALTER TABLE venue_layouts ADD COLUMN background_rotation double precision DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venue_layouts' AND column_name = 'background_locked'
  ) THEN
    ALTER TABLE venue_layouts ADD COLUMN background_locked boolean DEFAULT true;
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('floorplan-backgrounds', 'floorplan-backgrounds', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Authenticated users can upload floorplan backgrounds'
  ) THEN
    CREATE POLICY "Authenticated users can upload floorplan backgrounds"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'floorplan-backgrounds');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Authenticated users can update floorplan backgrounds'
  ) THEN
    CREATE POLICY "Authenticated users can update floorplan backgrounds"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'floorplan-backgrounds');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Authenticated users can delete floorplan backgrounds'
  ) THEN
    CREATE POLICY "Authenticated users can delete floorplan backgrounds"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'floorplan-backgrounds');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Public can read floorplan backgrounds'
  ) THEN
    CREATE POLICY "Public can read floorplan backgrounds"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'floorplan-backgrounds');
  END IF;
END $$;
