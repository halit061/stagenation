/*
  # Floorplan Enhancements and Table QR Implementation

  ## 1. Changes to floorplan_tables
    - Update table_type values from 'seating'/'standing' to 'SEATED'/'STANDING'
  
  ## 2. New Table: floorplan_objects
    - Create table for BAR, STAGE, and other fixed objects
    - Columns: id, event_id, type, name, x, y, width, height, rotation, is_active
    - Supports drag/resize/delete in SuperAdmin
    - Renders as non-clickable objects in public view
  
  ## 3. Table Bookings QR Enhancement
    - Add qr_payload (jsonb) - scanner-ready payload
    - Add qr_code (text) - base64 or URL of QR image
    - Add checked_in_at (timestamptz) - check-in timestamp
    - Add check_in_count (integer) - number of check-ins
  
  ## 4. Purpose
    - Allow table type selection (SEATED/STANDING)
    - Support floorplan objects (BAR/STAGE)
    - Enable QR code generation for table bookings
    - Support scanner functionality for table check-ins
  
  ## 5. Security
    - Enable RLS on floorplan_objects
    - Public can view active objects
    - Authenticated users can manage objects
*/

-- 1. Update table types - remove old constraint first
ALTER TABLE floorplan_tables 
DROP CONSTRAINT IF EXISTS floorplan_tables_table_type_check;

-- Update existing data
UPDATE floorplan_tables 
SET table_type = 'SEATED' 
WHERE table_type IN ('seating', 'seated');

UPDATE floorplan_tables 
SET table_type = 'STANDING' 
WHERE table_type IN ('standing');

-- Add new constraint
ALTER TABLE floorplan_tables 
ADD CONSTRAINT floorplan_tables_table_type_check 
CHECK (table_type IN ('SEATED', 'STANDING'));

-- 2. Create floorplan_objects table
CREATE TABLE IF NOT EXISTS floorplan_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('BAR', 'STAGE', 'DJ_BOOTH', 'ENTRANCE', 'EXIT', 'RESTROOM')),
  name text NOT NULL,
  x decimal(10,2) NOT NULL,
  y decimal(10,2) NOT NULL,
  width decimal(10,2) NOT NULL,
  height decimal(10,2) NOT NULL,
  rotation decimal(10,2) DEFAULT 0,
  color text DEFAULT '#f59e0b',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for active objects
CREATE INDEX IF NOT EXISTS idx_floorplan_objects_active 
ON floorplan_objects(event_id, is_active) 
WHERE is_active = true;

-- Enable RLS on floorplan_objects
ALTER TABLE floorplan_objects ENABLE ROW LEVEL SECURITY;

-- Floorplan objects policies
CREATE POLICY "Anyone can view active objects"
  ON floorplan_objects FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated users can manage objects"
  ON floorplan_objects FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3. Add QR fields to table_bookings
ALTER TABLE table_bookings 
ADD COLUMN IF NOT EXISTS qr_payload jsonb,
ADD COLUMN IF NOT EXISTS qr_code text,
ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
ADD COLUMN IF NOT EXISTS check_in_count integer DEFAULT 0;

-- Create index for QR lookups
CREATE INDEX IF NOT EXISTS idx_table_bookings_qr_payload 
ON table_bookings USING gin(qr_payload);

CREATE INDEX IF NOT EXISTS idx_table_bookings_checked_in 
ON table_bookings(checked_in_at) 
WHERE checked_in_at IS NOT NULL;

-- 4. Create function to generate QR payload
CREATE OR REPLACE FUNCTION generate_table_booking_qr_payload(
  p_booking_id uuid,
  p_event_id uuid,
  p_table_id uuid
) RETURNS jsonb AS $$
BEGIN
  RETURN jsonb_build_object(
    'v', 1,
    'type', 'TABLE',
    'booking_id', p_booking_id,
    'event_id', p_event_id,
    'table_id', p_table_id,
    'generated_at', EXTRACT(EPOCH FROM now())::bigint
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
