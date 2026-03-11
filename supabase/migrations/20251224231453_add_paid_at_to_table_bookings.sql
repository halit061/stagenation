/*
  # Add paid_at timestamp to table_bookings
  
  1. Changes
    - Add paid_at column to track when booking was paid
    - This matches the orders.paid_at structure
  
  2. Notes
    - Column is nullable since existing bookings may not have this data
    - Will be populated when payment is confirmed via webhook
*/

-- Add paid_at column
ALTER TABLE table_bookings 
ADD COLUMN IF NOT EXISTS paid_at timestamptz;