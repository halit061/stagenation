/*
  # Add GUEST status to table_bookings

  1. Changes
    - Adds 'GUEST' to the allowed status values for table_bookings
    - This allows guest table assignments to be tracked in the same table as paid bookings
  
  2. Purpose
    - Guest tables assigned through SuperAdmin need to appear in the bookings system
    - Using the same table ensures consistent floorplan status and dashboard visibility
*/

ALTER TABLE table_bookings DROP CONSTRAINT IF EXISTS table_bookings_status_check;

ALTER TABLE table_bookings ADD CONSTRAINT table_bookings_status_check 
  CHECK (status = ANY (ARRAY['PENDING'::text, 'PAID'::text, 'CANCELLED'::text, 'GUEST'::text]));