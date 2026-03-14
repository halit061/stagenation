/*
  # Create contact_messages, public_ticket_view and fix venue_zones schema

  ## Changes

  ### contact_messages (new table)
  - Stores contact form submissions from the Contact page
  - No auth required to insert (public form)

  ### public_ticket_view (new view)
  - Read-only view used by TicketView page to display ticket info via public_token
  - Joins tickets + ticket_types + events for easy display

  ### venue_zones (update existing table)
  - Add missing columns: ticket_type_id, zone_type, svg_path, label_x, label_y, sort_order
  - The VenueMapEditor component uses these columns
*/

-- contact_messages
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  ip_address text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert contact messages"
  ON public.contact_messages FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can view contact messages"
  ON public.contact_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can update contact messages"
  ON public.contact_messages FOR UPDATE
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

-- venue_zones: add missing columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venue_zones' AND column_name = 'ticket_type_id') THEN
    ALTER TABLE public.venue_zones ADD COLUMN ticket_type_id uuid REFERENCES public.ticket_types(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venue_zones' AND column_name = 'zone_type') THEN
    ALTER TABLE public.venue_zones ADD COLUMN zone_type text DEFAULT 'rect' CHECK (zone_type IN ('polygon', 'rect', 'ellipse'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venue_zones' AND column_name = 'svg_path') THEN
    ALTER TABLE public.venue_zones ADD COLUMN svg_path text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venue_zones' AND column_name = 'label_x') THEN
    ALTER TABLE public.venue_zones ADD COLUMN label_x numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venue_zones' AND column_name = 'label_y') THEN
    ALTER TABLE public.venue_zones ADD COLUMN label_y numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venue_zones' AND column_name = 'sort_order') THEN
    ALTER TABLE public.venue_zones ADD COLUMN sort_order integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venue_zones' AND column_name = 'rotation') THEN
    ALTER TABLE public.venue_zones ADD COLUMN rotation numeric DEFAULT 0;
  END IF;
END $$;

-- public_ticket_view: view for TicketView page
CREATE OR REPLACE VIEW public.public_ticket_view AS
  SELECT
    t.id,
    t.public_token,
    t.ticket_number,
    t.holder_name,
    t.holder_email,
    t.status,
    t.qr_data,
    t.qr_code,
    t.issued_at,
    t.used_at,
    t.metadata,
    tt.name AS ticket_type_name,
    tt.theme AS ticket_type_theme,
    tt.color AS ticket_type_color,
    e.name AS event_name,
    e.start_date AS event_start_date,
    e.end_date AS event_end_date,
    e.event_start AS event_start,
    e.event_end AS event_end,
    e.location AS event_location,
    e.venue_name AS event_venue_name,
    e.poster_url AS event_poster_url
  FROM public.tickets t
  LEFT JOIN public.ticket_types tt ON tt.id = t.ticket_type_id
  LEFT JOIN public.events e ON e.id = t.event_id
  WHERE t.public_token IS NOT NULL;

-- Grant select on the view to anon and authenticated
GRANT SELECT ON public.public_ticket_view TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
