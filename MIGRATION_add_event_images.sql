/*
  # Add Event Images Support (Posters & Logos)

  Run this SQL in your Supabase SQL Editor
*/

-- Add poster fields to events table (all nullable so event creation doesn't fail if upload fails)
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS poster_url text,
  ADD COLUMN IF NOT EXISTS poster_thumb_url text,
  ADD COLUMN IF NOT EXISTS poster_updated_at timestamptz;

-- Create event_logos table
CREATE TABLE IF NOT EXISTS event_logos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  logo_url text NOT NULL,
  logo_thumb_url text,
  label text,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on event_logos
ALTER TABLE event_logos ENABLE ROW LEVEL SECURITY;

-- Public can view logos for active events
CREATE POLICY "Public can view event logos"
  ON event_logos FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_logos.event_id
      AND events.is_active = true
    )
  );

-- Admins can manage event logos
CREATE POLICY "Admins can manage event logos"
  ON event_logos FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
      AND user_roles.role = ANY (ARRAY['super_admin'::text, 'admin'::text])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
      AND user_roles.role = ANY (ARRAY['super_admin'::text, 'admin'::text])
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_event_logos_event_id ON event_logos(event_id);
CREATE INDEX IF NOT EXISTS idx_event_logos_order ON event_logos(event_id, display_order);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_event_logos_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_event_logos_updated_at ON event_logos;
CREATE TRIGGER trigger_update_event_logos_updated_at
  BEFORE UPDATE ON event_logos
  FOR EACH ROW
  EXECUTE FUNCTION update_event_logos_updated_at();

-- STORAGE SETUP (Run these commands in Supabase Dashboard > Storage)
-- 1. Create a new public bucket called 'event-images'
-- 2. Set the following policies:

/*
Policy Name: Public can view event images
Allowed operation: SELECT
Target roles: public
USING expression: true

Policy Name: Admins can upload event images
Allowed operation: INSERT
Target roles: authenticated
WITH CHECK expression:
(EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['super_admin'::text, 'admin'::text])))))

Policy Name: Admins can update event images
Allowed operation: UPDATE
Target roles: authenticated
USING + WITH CHECK expression:
(EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['super_admin'::text, 'admin'::text])))))

Policy Name: Admins can delete event images
Allowed operation: DELETE
Target roles: authenticated
USING expression:
(EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['super_admin'::text, 'admin'::text])))))
*/

-- Verify the migration completed successfully
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'events'
AND column_name IN ('poster_url', 'poster_thumb_url', 'poster_updated_at')
ORDER BY column_name;
