/*
  # Add Event Poster and Logos Support

  1. Schema Changes
    - Add poster fields to `events` table:
      - `poster_url` (text, nullable) - Full size poster URL
      - `poster_thumb_url` (text, nullable) - Thumbnail poster URL
      - `poster_updated_at` (timestamptz, nullable) - Last poster update timestamp

    - Create `event_logos` table for multiple logo support:
      - `id` (uuid, primary key)
      - `event_id` (uuid, foreign key to events)
      - `logo_url` (text) - Full size logo URL
      - `logo_thumb_url` (text, nullable) - Thumbnail logo URL
      - `label` (text, nullable) - Logo label (e.g., "Sponsor", "Partner")
      - `display_order` (integer) - Sort order for display
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `event_logos` table
    - Add policies for authenticated users to manage event logos
    - Public read access for active events

  3. Indexes
    - Index on event_id for fast lookups
    - Index on display_order for sorting
*/

-- Add poster fields to events table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'poster_url'
  ) THEN
    ALTER TABLE events ADD COLUMN poster_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'poster_thumb_url'
  ) THEN
    ALTER TABLE events ADD COLUMN poster_thumb_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'poster_updated_at'
  ) THEN
    ALTER TABLE events ADD COLUMN poster_updated_at timestamptz;
  END IF;
END $$;

-- Create event_logos table
CREATE TABLE IF NOT EXISTS event_logos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  logo_url text NOT NULL,
  logo_thumb_url text,
  label text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_event_logos_event_id ON event_logos(event_id);
CREATE INDEX IF NOT EXISTS idx_event_logos_display_order ON event_logos(event_id, display_order);

-- Enable RLS
ALTER TABLE event_logos ENABLE ROW LEVEL SECURITY;

-- Public can view logos for active events
CREATE POLICY IF NOT EXISTS "Public can view logos for active events"
  ON event_logos FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_logos.event_id
      AND events.is_active = true
    )
  );

-- Authenticated users with super_admin role can manage all logos
CREATE POLICY IF NOT EXISTS "Super admins can manage all event logos"
  ON event_logos FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  );

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_event_logos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS event_logos_updated_at ON event_logos;
CREATE TRIGGER event_logos_updated_at
  BEFORE UPDATE ON event_logos
  FOR EACH ROW
  EXECUTE FUNCTION update_event_logos_updated_at();
