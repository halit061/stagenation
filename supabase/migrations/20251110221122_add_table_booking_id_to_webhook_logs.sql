/*
  # Add table_booking_id to webhook_logs

  1. Changes
    - Add `table_booking_id` column to `webhook_logs` table
    - Add foreign key constraint to `table_bookings` table
  
  2. Security
    - Maintains existing RLS policies
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'webhook_logs' AND column_name = 'table_booking_id'
  ) THEN
    ALTER TABLE webhook_logs ADD COLUMN table_booking_id uuid REFERENCES table_bookings(id);
  END IF;
END $$;