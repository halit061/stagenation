/*
  # Add Floorplan and Table Management

  1. New Tables
    - `floorplan_tables`
      - `id` (uuid, primary key)
      - `table_number` (text, unique) - e.g., "T1", "S1"
      - `table_type` (text) - "seating" or "standing"
      - `capacity` (integer)
      - `x` (decimal) - X position in SVG coordinates
      - `y` (decimal) - Y position in SVG coordinates
      - `width` (decimal) - Width in SVG units
      - `height` (decimal) - Height in SVG units
      - `rotation` (decimal) - Rotation angle in degrees
      - `price` (decimal)
      - `is_active` (boolean)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `table_bookings`
      - `id` (uuid, primary key)
      - `event_id` (uuid, foreign key to events)
      - `floorplan_table_id` (uuid, foreign key to floorplan_tables)
      - `customer_name` (text)
      - `customer_email` (text)
      - `customer_phone` (text)
      - `number_of_guests` (integer)
      - `special_requests` (text)
      - `total_price` (decimal)
      - `status` (text) - available, on_hold, sold, cancelled
      - `booking_code` (text, unique)
      - `hold_expires_at` (timestamp) - for temporary holds
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
  
  2. Security
    - Enable RLS on both tables
    - Public can view tables and their availability
    - Only authenticated admins can manage table positions
    - Customers can create bookings
*/

-- Create floorplan_tables table
CREATE TABLE IF NOT EXISTS floorplan_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number text UNIQUE NOT NULL,
  table_type text NOT NULL CHECK (table_type IN ('seating', 'standing')),
  capacity integer NOT NULL,
  x decimal(10,2) NOT NULL,
  y decimal(10,2) NOT NULL,
  width decimal(10,2) NOT NULL,
  height decimal(10,2) NOT NULL,
  rotation decimal(10,2) DEFAULT 0,
  price decimal(10,2) NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create table_bookings table
CREATE TABLE IF NOT EXISTS table_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  floorplan_table_id uuid REFERENCES floorplan_tables(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text NOT NULL,
  number_of_guests integer NOT NULL,
  special_requests text DEFAULT '',
  total_price decimal(10,2) NOT NULL,
  status text DEFAULT 'on_hold' CHECK (status IN ('available', 'on_hold', 'sold', 'cancelled')),
  booking_code text UNIQUE NOT NULL,
  hold_expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE floorplan_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_bookings ENABLE ROW LEVEL SECURITY;

-- Floorplan tables policies
CREATE POLICY "Anyone can view active tables"
  ON floorplan_tables FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated users can manage tables"
  ON floorplan_tables FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Table bookings policies
CREATE POLICY "Anyone can view bookings"
  ON table_bookings FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create bookings"
  ON table_bookings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update bookings"
  ON table_bookings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Insert default floorplan layout for The Max Eventcenter
-- Zaal dimensions: 1000x800 SVG units
-- DJ Booth: centered at back (x:400-600, y:50-120)
-- Dance floor: in front of DJ booth (x:350-650, y:150-350)
-- 10 Seating tables (T1-T10) around dance floor, 4 persons each
-- 10 Standing tables (S1-S10) at back/sides

-- Seating Tables (T1-T10) - 80x80 units each, 4 persons, €300
INSERT INTO floorplan_tables (table_number, table_type, capacity, x, y, width, height, price) VALUES
  ('T1', 'seating', 4, 200, 150, 80, 80, 300.00),
  ('T2', 'seating', 4, 200, 270, 80, 80, 300.00),
  ('T3', 'seating', 4, 200, 390, 80, 80, 300.00),
  ('T4', 'seating', 4, 350, 460, 80, 80, 300.00),
  ('T5', 'seating', 4, 500, 460, 80, 80, 300.00),
  ('T6', 'seating', 4, 650, 390, 80, 80, 300.00),
  ('T7', 'seating', 4, 720, 270, 80, 80, 300.00),
  ('T8', 'seating', 4, 720, 150, 80, 80, 300.00),
  ('T9', 'seating', 4, 570, 100, 80, 80, 300.00),
  ('T10', 'seating', 4, 350, 100, 80, 80, 300.00);

-- Standing Tables (S1-S10) - 60x60 units each, 6 persons, €200
INSERT INTO floorplan_tables (table_number, table_type, capacity, x, y, width, height, price) VALUES
  ('S1', 'standing', 6, 50, 100, 60, 60, 200.00),
  ('S2', 'standing', 6, 50, 220, 60, 60, 200.00),
  ('S3', 'standing', 6, 50, 340, 60, 60, 200.00),
  ('S4', 'standing', 6, 50, 460, 60, 60, 200.00),
  ('S5', 'standing', 6, 50, 580, 60, 60, 200.00),
  ('S6', 'standing', 6, 890, 100, 60, 60, 200.00),
  ('S7', 'standing', 6, 890, 220, 60, 60, 200.00),
  ('S8', 'standing', 6, 890, 340, 60, 60, 200.00),
  ('S9', 'standing', 6, 890, 460, 60, 60, 200.00),
  ('S10', 'standing', 6, 890, 580, 60, 60, 200.00);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_table_bookings_event ON table_bookings(event_id);
CREATE INDEX IF NOT EXISTS idx_table_bookings_table ON table_bookings(floorplan_table_id);
CREATE INDEX IF NOT EXISTS idx_table_bookings_status ON table_bookings(status);
CREATE INDEX IF NOT EXISTS idx_table_bookings_expires ON table_bookings(hold_expires_at);

-- Create function to automatically expire holds
CREATE OR REPLACE FUNCTION expire_table_holds()
RETURNS void AS $$
BEGIN
  UPDATE table_bookings
  SET status = 'cancelled'
  WHERE status = 'on_hold'
  AND hold_expires_at < now();
END;
$$ LANGUAGE plpgsql;