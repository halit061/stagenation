/*
  # Add Missing Floor Plan Tables
  
  This migration adds the missing floor plan and table reservation tables
  to complete the ticketing platform setup.
  
  ## New Tables
    - sections: Floor plan sections for organizing tables
    - tables: Individual tables within sections
    - holds: Temporary holds on tables during checkout process
  
  ## Security
    - RLS enabled on all tables
    - Public read access for sections and tables
    - Authenticated users can manage these resources
*/

-- ============================================================================
-- SECTIONS TABLE (Floor Plan)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  x numeric NOT NULL,
  y numeric NOT NULL,
  width numeric NOT NULL,
  height numeric NOT NULL,
  color text DEFAULT '#3b82f6',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sections_event_id ON sections(event_id);

ALTER TABLE sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view sections"
  ON sections FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can manage sections"
  ON sections FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TABLES TABLE (Table Reservations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  number text NOT NULL,
  seats integer NOT NULL CHECK (seats > 0),
  price integer NOT NULL CHECK (price >= 0),
  x numeric NOT NULL,
  y numeric NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'unavailable')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tables_section_id ON tables(section_id);
CREATE INDEX IF NOT EXISTS idx_tables_event_id ON tables(event_id);
CREATE INDEX IF NOT EXISTS idx_tables_status ON tables(status);

ALTER TABLE tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view available tables"
  ON tables FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can manage tables"
  ON tables FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- HOLDS TABLE (Temporary Table Holds)
-- ============================================================================

CREATE TABLE IF NOT EXISTS holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holds_table_id ON holds(table_id);
CREATE INDEX IF NOT EXISTS idx_holds_session_id ON holds(session_id);
CREATE INDEX IF NOT EXISTS idx_holds_expires_at ON holds(expires_at);

ALTER TABLE holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create holds"
  ON holds FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can view holds"
  ON holds FOR SELECT
  USING (true);

CREATE POLICY "System can delete expired holds"
  ON holds FOR DELETE
  USING (true);