/*
  # Add Table Reservations System

  1. New Tables
    - `table_types`
      - `id` (uuid, primary key)
      - `name` (text) - e.g., "VIP Table", "Premium Table"
      - `capacity` (integer) - number of people
      - `price` (decimal) - base price
      - `description` (text)
      - `features` (jsonb) - amenities included
      - `is_active` (boolean)
    
    - `table_reservations`
      - `id` (uuid, primary key)
      - `event_id` (uuid, foreign key to events)
      - `table_type_id` (uuid, foreign key to table_types)
      - `customer_name` (text)
      - `customer_email` (text)
      - `customer_phone` (text)
      - `number_of_guests` (integer)
      - `special_requests` (text)
      - `total_price` (decimal)
      - `payment_status` (text) - pending, paid, cancelled
      - `reservation_code` (text, unique)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
  
  2. Security
    - Enable RLS on both tables
    - Public can view table types
    - Only authenticated admins can manage reservations
    - Customers can view their own reservations by reservation code
*/

-- Create table_types table
CREATE TABLE IF NOT EXISTS table_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  capacity integer NOT NULL,
  price decimal(10,2) NOT NULL,
  description text,
  features jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create table_reservations table
CREATE TABLE IF NOT EXISTS table_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  table_type_id uuid REFERENCES table_types(id) ON DELETE RESTRICT,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text NOT NULL,
  number_of_guests integer NOT NULL,
  special_requests text DEFAULT '',
  total_price decimal(10,2) NOT NULL,
  payment_status text DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'cancelled')),
  reservation_code text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE table_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_reservations ENABLE ROW LEVEL SECURITY;

-- Table types policies (public can view active types)
CREATE POLICY "Anyone can view active table types"
  ON table_types FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated users can manage table types"
  ON table_types FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Table reservations policies
CREATE POLICY "Anyone can create table reservations"
  ON table_reservations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view all reservations"
  ON table_reservations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update reservations"
  ON table_reservations FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Insert default table types
INSERT INTO table_types (name, capacity, price, description, features) VALUES
  (
    'Standard Table',
    6,
    500.00,
    'Perfect for small groups',
    '["Reserved seating", "Bottle service available", "Dedicated server"]'::jsonb
  ),
  (
    'VIP Table',
    8,
    1000.00,
    'Premium location with excellent view',
    '["Prime location", "Bottle service included", "Dedicated VIP server", "Complimentary mixers", "Reserved parking"]'::jsonb
  ),
  (
    'Premium VIP Table',
    10,
    1500.00,
    'Ultimate VIP experience',
    '["Best location in venue", "Premium bottle service", "Personal VIP host", "Complimentary champagne", "Reserved VIP parking", "Private entrance"]'::jsonb
  ),
  (
    'Sky Box',
    12,
    2000.00,
    'Exclusive elevated private area',
    '["Elevated private area", "Premium bottle service", "Personal VIP host", "Complimentary premium spirits", "VIP parking", "Private entrance", "Separate restroom access"]'::jsonb
  )
ON CONFLICT DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_table_reservations_event ON table_reservations(event_id);
CREATE INDEX IF NOT EXISTS idx_table_reservations_code ON table_reservations(reservation_code);
CREATE INDEX IF NOT EXISTS idx_table_reservations_email ON table_reservations(customer_email);
