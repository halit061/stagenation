/*
  # Add Manual Status Control to Floorplan Tables

  1. Changes
    - Add `manual_status` column to `floorplan_tables` table
    - Default value is 'AVAILABLE'
    - Allowed values: 'AVAILABLE', 'SOLD'
  
  2. Purpose
    - Allows SuperAdmin to manually mark tables as SOLD
    - Works alongside booking status to determine effective availability
    - SOLD tables appear red and are not clickable/bookable
  
  3. Effective Status Logic
    A table is SOLD if:
    - manual_status = 'SOLD' OR
    - there exists a PAID table_booking for this table + event
    
    Otherwise, the table is AVAILABLE
  
  4. Notes
    - When a booking is cancelled, the table becomes available UNLESS manual_status = 'SOLD'
    - Admin can manually block/unblock tables regardless of booking status
    - Validation prevents setting to AVAILABLE if active PAID booking exists
*/

-- Add manual_status column to floorplan_tables
ALTER TABLE floorplan_tables 
ADD COLUMN IF NOT EXISTS manual_status text DEFAULT 'AVAILABLE' 
CHECK (manual_status IN ('AVAILABLE', 'SOLD'));

-- Create index for faster status queries
CREATE INDEX IF NOT EXISTS idx_floorplan_tables_manual_status 
ON floorplan_tables(manual_status) 
WHERE manual_status = 'SOLD';
