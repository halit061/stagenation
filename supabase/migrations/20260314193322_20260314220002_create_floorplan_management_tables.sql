/*
  # Create entrances, floorplan_objects, visual_standing_tables, venue_zones, table_packages

  ## Purpose
  These tables support the floor plan editor, venue map editor, table management,
  and entrance/ticket type management features.

  ## New Tables

  ### entrances
  - Named entry points for events (e.g., "Main Entrance", "VIP Entrance")
  - Ticket types can be assigned to specific entrances

  ### floorplan_objects
  - Visual objects on the floor plan (labels, shapes, decorations)
  - Different from floorplan_tables (which are bookable tables)

  ### visual_standing_tables
  - Visual representation of standing areas on the floor plan
  - Not bookable individually, just for display

  ### venue_zones
  - Named zones/areas in the venue (VIP area, dance floor, etc.)
  - Used by the venue map editor

  ### table_packages
  - Packages that include tables + drinks/extras
  - Can be linked to floorplan_tables for bundled offerings
*/

-- entrances
CREATE TABLE IF NOT EXISTS public.entrances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text DEFAULT '#3b82f6',
  is_active boolean DEFAULT true,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.entrances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view entrances"
  ON public.entrances FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can insert entrances"
  ON public.entrances FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can update entrances"
  ON public.entrances FOR UPDATE
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

CREATE POLICY "Admins can delete entrances"
  ON public.entrances FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

-- floorplan_objects (labels, decorations, shapes on the floor plan)
CREATE TABLE IF NOT EXISTS public.floorplan_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  object_type text NOT NULL DEFAULT 'label',
  label text,
  label_nl text,
  label_tr text,
  x numeric NOT NULL DEFAULT 0,
  y numeric NOT NULL DEFAULT 0,
  width numeric DEFAULT 100,
  height numeric DEFAULT 50,
  rotation numeric DEFAULT 0,
  color text DEFAULT '#ffffff',
  background_color text,
  font_size numeric DEFAULT 14,
  font_weight text DEFAULT 'normal',
  is_visible boolean DEFAULT true,
  is_active boolean DEFAULT true,
  display_order integer DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.floorplan_objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active floorplan objects"
  ON public.floorplan_objects FOR SELECT
  TO anon, authenticated
  USING (is_active = true AND is_visible = true);

CREATE POLICY "Admins can view all floorplan objects"
  ON public.floorplan_objects FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can insert floorplan objects"
  ON public.floorplan_objects FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can update floorplan objects"
  ON public.floorplan_objects FOR UPDATE
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

CREATE POLICY "Admins can delete floorplan objects"
  ON public.floorplan_objects FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

-- visual_standing_tables
CREATE TABLE IF NOT EXISTS public.visual_standing_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  label text,
  x numeric NOT NULL DEFAULT 0,
  y numeric NOT NULL DEFAULT 0,
  width numeric DEFAULT 80,
  height numeric DEFAULT 80,
  rotation numeric DEFAULT 0,
  color text DEFAULT '#6b7280',
  capacity integer DEFAULT 0,
  is_visible boolean DEFAULT true,
  is_active boolean DEFAULT true,
  display_order integer DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.visual_standing_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active visual standing tables"
  ON public.visual_standing_tables FOR SELECT
  TO anon, authenticated
  USING (is_active = true AND is_visible = true);

CREATE POLICY "Admins can view all visual standing tables"
  ON public.visual_standing_tables FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can insert visual standing tables"
  ON public.visual_standing_tables FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can update visual standing tables"
  ON public.visual_standing_tables FOR UPDATE
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

CREATE POLICY "Admins can delete visual standing tables"
  ON public.visual_standing_tables FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

-- venue_zones
CREATE TABLE IF NOT EXISTS public.venue_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_nl text,
  name_tr text,
  x numeric NOT NULL DEFAULT 0,
  y numeric NOT NULL DEFAULT 0,
  width numeric DEFAULT 200,
  height numeric DEFAULT 150,
  color text DEFAULT '#3b82f6',
  opacity numeric DEFAULT 0.3,
  is_visible boolean DEFAULT true,
  is_active boolean DEFAULT true,
  display_order integer DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.venue_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active venue zones"
  ON public.venue_zones FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "Admins can insert venue zones"
  ON public.venue_zones FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can update venue zones"
  ON public.venue_zones FOR UPDATE
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

CREATE POLICY "Admins can delete venue zones"
  ON public.venue_zones FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

-- table_packages
CREATE TABLE IF NOT EXISTS public.table_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  floorplan_table_id uuid REFERENCES public.floorplan_tables(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  price integer NOT NULL DEFAULT 0,
  included_items jsonb DEFAULT '[]',
  min_persons integer DEFAULT 1,
  max_persons integer,
  is_active boolean DEFAULT true,
  display_order integer DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.table_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active table packages"
  ON public.table_packages FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "Admins can view all table packages"
  ON public.table_packages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can insert table packages"
  ON public.table_packages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can update table packages"
  ON public.table_packages FOR UPDATE
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

CREATE POLICY "Admins can delete table packages"
  ON public.table_packages FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_entrances_event_id ON public.entrances(event_id);
CREATE INDEX IF NOT EXISTS idx_floorplan_objects_event_id ON public.floorplan_objects(event_id);
CREATE INDEX IF NOT EXISTS idx_visual_standing_tables_event_id ON public.visual_standing_tables(event_id);
CREATE INDEX IF NOT EXISTS idx_venue_zones_event_id ON public.venue_zones(event_id);
CREATE INDEX IF NOT EXISTS idx_table_packages_event_id ON public.table_packages(event_id);

NOTIFY pgrst, 'reload schema';
