/*
  # Fix table_bookings status constraint
  
  1. Problem
    - Current constraint only allows: 'available', 'sold', 'cancelled'
    - Code tries to insert 'pending' status, which violates constraint
    - This prevents table reservations from working
  
  2. Solution
    - Drop existing status check constraint
    - Recreate with correct values: 'available', 'pending', 'sold', 'cancelled'
  
  3. Table Booking Lifecycle
    - 'available' - Table is free and can be booked
    - 'pending' - Payment is being processed
    - 'sold' - Payment completed, booking confirmed
    - 'cancelled' - Booking was cancelled
  
  4. Security
    - Maintains data integrity with valid status values
    - No RLS changes needed
*/

-- Drop the existing constraint
ALTER TABLE table_bookings 
DROP CONSTRAINT IF EXISTS table_bookings_status_check;

-- Recreate constraint with correct allowed values
ALTER TABLE table_bookings 
ADD CONSTRAINT table_bookings_status_check 
CHECK (status = ANY (ARRAY['available'::text, 'pending'::text, 'sold'::text, 'cancelled'::text]));