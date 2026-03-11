/*
  # Add Table Reservation Cancellation Tracking

  1. New Fields
    - `cancelled_at` (timestamptz) - When the booking was cancelled
    - `cancellation_reason` (text) - Optional reason for cancellation
    - `refund_percentage` (integer) - Percentage of refund (0-100)
    - `refund_amount` (integer) - Refund amount in cents
    - `refund_policy_applied` (text) - Which policy was applied (e.g., 'free_cancellation', '30_percent_retention')

  2. Status Updates
    - Update status constraint to use uppercase: AVAILABLE, PENDING, PAID, CANCELLED
    - Migrate existing lowercase values to uppercase

  3. Business Logic
    - Free cancellation until 10 days before event
    - Within 10 days: 30% retention (70% refund)
    - Cancelled bookings should not block table availability
*/

-- Drop old constraint first
ALTER TABLE table_bookings DROP CONSTRAINT IF EXISTS table_bookings_status_check;

-- Migrate existing status values to uppercase
UPDATE table_bookings SET status = 'AVAILABLE' WHERE status = 'available';
UPDATE table_bookings SET status = 'PENDING' WHERE status = 'pending';
UPDATE table_bookings SET status = 'PAID' WHERE status = 'paid';
UPDATE table_bookings SET status = 'CANCELLED' WHERE status = 'cancelled';

-- Add new constraint with uppercase values
ALTER TABLE table_bookings 
ADD CONSTRAINT table_bookings_status_check 
CHECK (status = ANY (ARRAY['AVAILABLE'::text, 'PENDING'::text, 'PAID'::text, 'CANCELLED'::text]));

-- Update default value to uppercase
ALTER TABLE table_bookings ALTER COLUMN status SET DEFAULT 'AVAILABLE';

-- Add cancellation tracking fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'table_bookings' AND column_name = 'cancelled_at'
  ) THEN
    ALTER TABLE table_bookings ADD COLUMN cancelled_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'table_bookings' AND column_name = 'cancellation_reason'
  ) THEN
    ALTER TABLE table_bookings ADD COLUMN cancellation_reason text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'table_bookings' AND column_name = 'refund_percentage'
  ) THEN
    ALTER TABLE table_bookings ADD COLUMN refund_percentage integer DEFAULT 0 CHECK (refund_percentage >= 0 AND refund_percentage <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'table_bookings' AND column_name = 'refund_amount'
  ) THEN
    ALTER TABLE table_bookings ADD COLUMN refund_amount integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'table_bookings' AND column_name = 'refund_policy_applied'
  ) THEN
    ALTER TABLE table_bookings ADD COLUMN refund_policy_applied text;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_table_bookings_status ON table_bookings(status);
CREATE INDEX IF NOT EXISTS idx_table_bookings_cancelled_at ON table_bookings(cancelled_at) WHERE cancelled_at IS NOT NULL;