/*
  # Fix table_bookings Status Constraint - With Data Cleanup

  1. Issue
    - Current constraint allows: AVAILABLE, PENDING, PAID, CANCELLED
    - Code only uses: PENDING, PAID, CANCELLED
    - 2 existing records have AVAILABLE status (abandoned bookings)

  2. Data Cleanup
    - Migrate AVAILABLE records to CANCELLED (abandoned/unpaid bookings)
    - Set cancellation metadata for audit trail

  3. Constraint Update
    - Drop existing status constraint
    - Create new constraint with ONLY: PENDING, PAID, CANCELLED
    - Update default value to PENDING

  4. Status Flow
    - Table selection → status = 'PENDING'
    - Payment success → status = 'PAID'
    - Admin cancels → status = 'CANCELLED'
*/

-- Step 1: Migrate AVAILABLE records to CANCELLED
UPDATE table_bookings 
SET 
  status = 'CANCELLED',
  cancelled_at = NOW(),
  cancellation_reason = 'Migration: Abandoned booking with AVAILABLE status',
  updated_at = NOW()
WHERE status = 'AVAILABLE';

-- Step 2: Drop the old constraint
ALTER TABLE table_bookings DROP CONSTRAINT IF EXISTS table_bookings_status_check;

-- Step 3: Create new constraint with only PENDING, PAID, CANCELLED
ALTER TABLE table_bookings 
ADD CONSTRAINT table_bookings_status_check 
CHECK (status = ANY (ARRAY['PENDING'::text, 'PAID'::text, 'CANCELLED'::text]));

-- Step 4: Update default to PENDING
ALTER TABLE table_bookings ALTER COLUMN status SET DEFAULT 'PENDING';

-- Step 5: Add comment explaining the status values
COMMENT ON COLUMN table_bookings.status IS 'Booking status: PENDING (payment processing), PAID (confirmed), CANCELLED (cancelled by admin or abandoned)';

-- Create index for efficient status filtering (if not exists)
CREATE INDEX IF NOT EXISTS idx_table_bookings_status_active ON table_bookings(status) WHERE status IN ('PENDING', 'PAID');