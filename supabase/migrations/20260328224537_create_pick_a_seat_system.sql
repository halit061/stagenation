/*
  # Pick-a-Seat System - Complete Schema

  ## Overview
  Adds a full individual seat selection system (like Ticketmaster) alongside
  the existing floorplan table/standing-area management. This migration does
  NOT touch any existing tables.

  ## New Tables

  ### 1. venue_layouts
  - Stores the full canvas layout for a venue (sections, scale, positions)
  - Can be linked to a specific event or reused across events
  - `layout_data` JSONB stores the complete editor canvas state
  - Columns: id, venue_id, event_id, name, layout_data, created_at, updated_at

  ### 2. seat_sections
  - Individual sections/blocks within a layout (e.g. "BLOK A", "TRIBUNE LINKS")
  - Section types: tribune (seated rows) or plein (general/flexible)
  - Each section has its own price category, color, geometry and row config
  - Columns: id, layout_id, name, section_type, capacity, color, price_category,
    price_amount, position_x/y, width, height, rotation, rows_count, seats_per_row,
    row_curve, sort_order, is_active, created_at, updated_at

  ### 3. seats
  - Individual seats within a section
  - Auto-generated label from row + seat number (e.g. "A-12")
  - Tracks status: available, blocked, reserved, sold
  - Supports special seat types: wheelchair, companion, vip, restricted_view
  - Columns: id, section_id, row_label, seat_number, seat_label (generated),
    x_position, y_position, status, price_override, seat_type, metadata, is_active

  ### 4. seat_holds
  - Temporary seat reservations with auto-expiry (10 min default)
  - Supports both authenticated users and anonymous sessions
  - Status flow: held -> released | converted
  - Columns: id, seat_id, event_id, user_id, session_id, held_at, expires_at, status

  ### 5. ticket_seats
  - Links purchased tickets to specific seats
  - Unique constraint prevents double-selling per event
  - Columns: id, ticket_id, seat_id, event_id, price_paid, assigned_at

  ## Security
  - RLS enabled on ALL tables
  - Admin access via user_roles (super_admin, admin) with is_active check
  - Public read access for layouts, sections, and seats (needed for seat picker UI)
  - seat_holds: users can manage their own holds, admins have full access
  - ticket_seats: public read for ticket verification, admin write

  ## Functions
  - release_expired_holds(): Cleans up expired holds and resets seat status
  - Auto-update trigger on updated_at for venue_layouts and seat_sections

  ## Indexes
  - Optimized for seat availability queries, hold expiry cleanup, and section lookups
*/

-- =============================================================================
-- TABLE: venue_layouts
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.venue_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  name text NOT NULL,
  layout_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.venue_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read venue layouts"
  ON public.venue_layouts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon can read venue layouts"
  ON public.venue_layouts FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Admins can insert venue layouts"
  ON public.venue_layouts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can update venue layouts"
  ON public.venue_layouts FOR UPDATE
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

CREATE POLICY "Admins can delete venue layouts"
  ON public.venue_layouts FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

-- =============================================================================
-- TABLE: seat_sections
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.seat_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id uuid REFERENCES public.venue_layouts(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  section_type text NOT NULL CHECK (section_type IN ('tribune', 'plein')),
  capacity integer DEFAULT 0,
  color text DEFAULT '#3b82f6',
  price_category text,
  price_amount decimal(10,2) DEFAULT 0.00,
  position_x double precision DEFAULT 0,
  position_y double precision DEFAULT 0,
  width double precision DEFAULT 200,
  height double precision DEFAULT 150,
  rotation double precision DEFAULT 0,
  rows_count integer DEFAULT 0,
  seats_per_row integer DEFAULT 0,
  row_curve double precision DEFAULT 0,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.seat_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active seat sections"
  ON public.seat_sections FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Anon can read active seat sections"
  ON public.seat_sections FOR SELECT
  TO anon
  USING (is_active = true);

CREATE POLICY "Admins can read all seat sections"
  ON public.seat_sections FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can insert seat sections"
  ON public.seat_sections FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can update seat sections"
  ON public.seat_sections FOR UPDATE
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

CREATE POLICY "Admins can delete seat sections"
  ON public.seat_sections FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

-- =============================================================================
-- TABLE: seats
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid REFERENCES public.seat_sections(id) ON DELETE CASCADE NOT NULL,
  row_label text NOT NULL,
  seat_number integer NOT NULL,
  seat_label text GENERATED ALWAYS AS (row_label || '-' || seat_number::text) STORED,
  x_position double precision NOT NULL,
  y_position double precision NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'blocked', 'reserved', 'sold')),
  price_override decimal(10,2),
  seat_type text DEFAULT 'regular' CHECK (seat_type IN ('regular', 'wheelchair', 'companion', 'vip', 'restricted_view')),
  metadata jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.seats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active seats"
  ON public.seats FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Anon can read active seats"
  ON public.seats FOR SELECT
  TO anon
  USING (is_active = true);

CREATE POLICY "Admins can read all seats"
  ON public.seats FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can insert seats"
  ON public.seats FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can update seats"
  ON public.seats FOR UPDATE
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

CREATE POLICY "Admins can delete seats"
  ON public.seats FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

-- =============================================================================
-- TABLE: seat_holds
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.seat_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_id uuid REFERENCES public.seats(id) ON DELETE CASCADE NOT NULL,
  event_id uuid NOT NULL,
  user_id uuid,
  session_id text,
  held_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  status text DEFAULT 'held' CHECK (status IN ('held', 'released', 'converted')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.seat_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own seat holds"
  ON public.seat_holds FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Anon can read own session holds"
  ON public.seat_holds FOR SELECT
  TO anon
  USING (session_id IS NOT NULL);

CREATE POLICY "Users can insert seat holds"
  ON public.seat_holds FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own seat holds"
  ON public.seat_holds FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can read all seat holds"
  ON public.seat_holds FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can insert seat holds"
  ON public.seat_holds FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can update seat holds"
  ON public.seat_holds FOR UPDATE
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

CREATE POLICY "Admins can delete seat holds"
  ON public.seat_holds FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

-- =============================================================================
-- TABLE: ticket_seats
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ticket_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  seat_id uuid REFERENCES public.seats(id) NOT NULL,
  event_id uuid NOT NULL,
  price_paid decimal(10,2) NOT NULL,
  assigned_at timestamptz DEFAULT now(),
  UNIQUE(seat_id, event_id)
);

ALTER TABLE public.ticket_seats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read ticket seats"
  ON public.ticket_seats FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon can read ticket seats"
  ON public.ticket_seats FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Admins can insert ticket seats"
  ON public.ticket_seats FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can update ticket seats"
  ON public.ticket_seats FOR UPDATE
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

CREATE POLICY "Admins can delete ticket seats"
  ON public.ticket_seats FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_seats_section_id ON public.seats(section_id);
CREATE INDEX IF NOT EXISTS idx_seats_status ON public.seats(status);
CREATE INDEX IF NOT EXISTS idx_seats_section_status ON public.seats(section_id, status);
CREATE INDEX IF NOT EXISTS idx_seat_holds_seat_event ON public.seat_holds(seat_id, event_id);
CREATE INDEX IF NOT EXISTS idx_seat_holds_expires ON public.seat_holds(expires_at) WHERE status = 'held';
CREATE INDEX IF NOT EXISTS idx_seat_holds_session ON public.seat_holds(session_id) WHERE status = 'held';
CREATE INDEX IF NOT EXISTS idx_ticket_seats_event ON public.ticket_seats(event_id);
CREATE INDEX IF NOT EXISTS idx_ticket_seats_seat_event ON public.ticket_seats(seat_id, event_id);
CREATE INDEX IF NOT EXISTS idx_seat_sections_layout ON public.seat_sections(layout_id);

-- =============================================================================
-- TRIGGER: auto-update updated_at on venue_layouts & seat_sections
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_venue_layouts_updated_at'
  ) THEN
    CREATE TRIGGER trg_venue_layouts_updated_at
      BEFORE UPDATE ON public.venue_layouts
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_seat_sections_updated_at'
  ) THEN
    CREATE TRIGGER trg_seat_sections_updated_at
      BEFORE UPDATE ON public.seat_sections
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- =============================================================================
-- FUNCTION: release_expired_holds
-- Releases expired holds and resets associated seats back to 'available'
-- =============================================================================
CREATE OR REPLACE FUNCTION public.release_expired_holds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  released_count integer;
BEGIN
  WITH expired AS (
    UPDATE public.seat_holds
    SET status = 'released'
    WHERE status = 'held'
      AND expires_at < now()
    RETURNING seat_id
  )
  UPDATE public.seats
  SET status = 'available'
  WHERE id IN (SELECT seat_id FROM expired)
    AND status = 'reserved';

  GET DIAGNOSTICS released_count = ROW_COUNT;
  RETURN released_count;
END;
$$;
