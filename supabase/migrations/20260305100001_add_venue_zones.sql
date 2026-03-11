-- Venue zones for interactive stage/venue map on tickets page
CREATE TABLE IF NOT EXISTS venue_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  ticket_type_id uuid REFERENCES ticket_types(id) ON DELETE SET NULL,
  zone_type text NOT NULL DEFAULT 'rect' CHECK (zone_type IN ('polygon', 'rect', 'ellipse')),
  svg_path text,
  x float DEFAULT 0,
  y float DEFAULT 0,
  width float DEFAULT 100,
  height float DEFAULT 80,
  rotation float DEFAULT 0,
  label_x float,
  label_y float,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_zones_event ON venue_zones(event_id);

ALTER TABLE venue_zones ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'public_read_venue_zones'
  ) THEN
    CREATE POLICY public_read_venue_zones ON venue_zones FOR SELECT USING (is_active = true);
  END IF;
END $$;

-- Add venue_map_config JSONB column to events table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'venue_map_config'
  ) THEN
    ALTER TABLE events ADD COLUMN venue_map_config jsonb DEFAULT NULL;
  END IF;
END $$;
