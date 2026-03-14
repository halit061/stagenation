/*
  # Create event_logos table

  ## Purpose
  The upload-event-image edge function inserts logo records into event_logos
  when uploading sponsor/organizer logos for events. This table was missing.

  ## New Table: event_logos
  - `id` (uuid, primary key)
  - `event_id` (uuid, foreign key to events)
  - `logo_url` (text) - full-size logo URL
  - `logo_thumb_url` (text) - thumbnail logo URL
  - `label` (text, nullable) - optional label/name for the logo
  - `display_order` (integer, default 0) - sort order for display
  - `created_at` (timestamptz)

  ## Security
  - RLS enabled
  - Public can view logos (needed for event pages)
  - Only admins can insert/update/delete
*/

CREATE TABLE IF NOT EXISTS public.event_logos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  logo_url text NOT NULL,
  logo_thumb_url text,
  label text,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.event_logos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view event logos"
  ON public.event_logos FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins can insert event logos"
  ON public.event_logos FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can update event logos"
  ON public.event_logos FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can delete event logos"
  ON public.event_logos FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE INDEX IF NOT EXISTS idx_event_logos_event_id ON public.event_logos(event_id);

NOTIFY pgrst, 'reload schema';
