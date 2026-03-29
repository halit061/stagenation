/*
  # Brand System, Ticket-Section Linking & Layout Templates

  1. Modified Tables
    - `brands` - Added logo_url, primary_color, is_active columns
    - `venue_layouts` - Added brand_id, is_template, source_template_id
    - `events` - Added brand_id (if not exists)

  2. New Tables
    - `ticket_type_sections` - Links ticket types to seat sections
      - `id` (uuid, primary key)
      - `ticket_type_id` (uuid)
      - `section_id` (uuid, references seat_sections)
      - Unique on (ticket_type_id, section_id)

  3. New Functions
    - `get_current_brand_id()` - Returns the StageNation brand ID
    - `copy_template_for_event(template_id, event_id, brand_id)` - Atomically deep-copies a template layout

  4. Security
    - RLS on ticket_type_sections with admin write, authenticated read
    - Brand isolation indexes

  5. Data Changes
    - Inserts 'StageNation' brand
    - Backfills existing venue_layouts and events with brand_id
*/

-- ============================================================
-- 1. EXTEND BRANDS TABLE
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'brands' AND column_name = 'logo_url'
  ) THEN
    ALTER TABLE brands ADD COLUMN logo_url TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'brands' AND column_name = 'primary_color'
  ) THEN
    ALTER TABLE brands ADD COLUMN primary_color TEXT DEFAULT '#ef4444';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'brands' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE brands ADD COLUMN is_active BOOLEAN DEFAULT true;
  END IF;
END $$;

INSERT INTO brands (name, slug, primary_color)
VALUES ('StageNation', 'stagenation', '#ef4444')
ON CONFLICT (slug) DO NOTHING;

-- Add RLS policy for public read (authenticated)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'brands' AND policyname = 'Authenticated read active brands'
  ) THEN
    CREATE POLICY "Authenticated read active brands"
      ON brands
      FOR SELECT
      TO authenticated
      USING (is_active = true);
  END IF;
END $$;

-- ============================================================
-- 2. ADD BRAND_ID AND TEMPLATE COLUMNS TO VENUE_LAYOUTS
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venue_layouts' AND column_name = 'brand_id'
  ) THEN
    ALTER TABLE venue_layouts ADD COLUMN brand_id UUID REFERENCES brands(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venue_layouts' AND column_name = 'is_template'
  ) THEN
    ALTER TABLE venue_layouts ADD COLUMN is_template BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venue_layouts' AND column_name = 'source_template_id'
  ) THEN
    ALTER TABLE venue_layouts ADD COLUMN source_template_id UUID REFERENCES venue_layouts(id);
  END IF;
END $$;

UPDATE venue_layouts
SET brand_id = (SELECT id FROM brands WHERE slug = 'stagenation' LIMIT 1)
WHERE brand_id IS NULL;

-- ============================================================
-- 3. ADD BRAND_ID TO EVENTS (if not exists)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'brand_id'
  ) THEN
    ALTER TABLE events ADD COLUMN brand_id UUID REFERENCES brands(id);
  END IF;
END $$;

UPDATE events
SET brand_id = (SELECT id FROM brands WHERE slug = 'stagenation' LIMIT 1)
WHERE brand_id IS NULL;

-- ============================================================
-- 4. TICKET TYPE <-> SECTION LINKING TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS ticket_type_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_type_id UUID NOT NULL,
  section_id UUID REFERENCES seat_sections(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ticket_type_id, section_id)
);

CREATE INDEX IF NOT EXISTS idx_tts_ticket ON ticket_type_sections(ticket_type_id);
CREATE INDEX IF NOT EXISTS idx_tts_section ON ticket_type_sections(section_id);

ALTER TABLE ticket_type_sections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ticket_type_sections' AND policyname = 'Admins manage ticket_type_sections'
  ) THEN
    CREATE POLICY "Admins manage ticket_type_sections"
      ON ticket_type_sections
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM user_roles
          WHERE user_roles.user_id = auth.uid()
          AND user_roles.role IN ('super_admin', 'admin')
          AND user_roles.is_active = true
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM user_roles
          WHERE user_roles.user_id = auth.uid()
          AND user_roles.role IN ('super_admin', 'admin')
          AND user_roles.is_active = true
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ticket_type_sections' AND policyname = 'Authenticated read ticket_type_sections'
  ) THEN
    CREATE POLICY "Authenticated read ticket_type_sections"
      ON ticket_type_sections
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- ============================================================
-- 5. HELPER: GET CURRENT BRAND ID
-- ============================================================

CREATE OR REPLACE FUNCTION get_current_brand_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (SELECT id FROM brands WHERE slug = 'stagenation' LIMIT 1);
END;
$$;

GRANT EXECUTE ON FUNCTION get_current_brand_id TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_brand_id TO anon;

-- ============================================================
-- 6. ATOMIC TEMPLATE COPY FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION copy_template_for_event(
  p_template_id UUID,
  p_event_id UUID,
  p_brand_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_layout_id UUID;
  v_new_section_id UUID;
  r RECORD;
BEGIN
  INSERT INTO venue_layouts (name, layout_data, brand_id, event_id, is_template, source_template_id)
  SELECT name || ' (kopie)', layout_data, p_brand_id, p_event_id, false, p_template_id
  FROM venue_layouts
  WHERE id = p_template_id
  RETURNING id INTO v_new_layout_id;

  IF v_new_layout_id IS NULL THEN
    RAISE EXCEPTION 'Template not found: %', p_template_id;
  END IF;

  FOR r IN
    SELECT * FROM seat_sections
    WHERE layout_id = p_template_id AND is_active = true
  LOOP
    INSERT INTO seat_sections (
      layout_id, name, section_type, capacity, color,
      price_category, price_amount, position_x, position_y,
      width, height, rotation, rows_count, seats_per_row,
      row_curve, sort_order, is_active, orientation
    )
    VALUES (
      v_new_layout_id, r.name, r.section_type, r.capacity, r.color,
      r.price_category, r.price_amount, r.position_x, r.position_y,
      r.width, r.height, r.rotation, r.rows_count, r.seats_per_row,
      r.row_curve, r.sort_order, true, r.orientation
    )
    RETURNING id INTO v_new_section_id;

    INSERT INTO seats (
      section_id, row_label, seat_number, x_position, y_position,
      status, price_override, seat_type, metadata, is_active
    )
    SELECT
      v_new_section_id, row_label, seat_number, x_position, y_position,
      'available', price_override, seat_type, metadata, true
    FROM seats
    WHERE section_id = r.id AND is_active = true;
  END LOOP;

  RETURN v_new_layout_id;
END;
$$;

GRANT EXECUTE ON FUNCTION copy_template_for_event TO authenticated;

-- ============================================================
-- 7. INDEXES FOR BRAND FILTERING AND TEMPLATES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_venue_layouts_brand ON venue_layouts(brand_id);
CREATE INDEX IF NOT EXISTS idx_events_brand ON events(brand_id);
CREATE INDEX IF NOT EXISTS idx_venue_layouts_template ON venue_layouts(is_template) WHERE is_template = true;
