/*
  # Update table_bookings status values to use 'paid' instead of 'sold'
  
  1. Changes
    - Update constraint to use 'paid' instead of 'sold' for consistency
    - Update any existing 'sold' records to 'paid'
  
  2. Status Values
    - 'available' - Table is free and can be booked
    - 'pending' - Payment is being processed
    - 'paid' - Payment completed, booking confirmed
    - 'cancelled' - Booking was cancelled
*/

-- Update any existing 'sold' records to 'paid'
UPDATE table_bookings 
SET status = 'paid' 
WHERE status = 'sold';

-- Drop the existing constraint
ALTER TABLE table_bookings 
DROP CONSTRAINT IF EXISTS table_bookings_status_check;

-- Recreate constraint with 'paid' instead of 'sold'
ALTER TABLE table_bookings 
ADD CONSTRAINT table_bookings_status_check 
CHECK (status = ANY (ARRAY['available'::text, 'pending'::text, 'paid'::text, 'cancelled'::text]));