/*
  # Table Reservation System - Master Fix

  ## 1. Overview
  This migration ensures the complete table reservation system is production-ready.

  ## 2. Changes to floorplan_tables
  - Ensure `table_number` is editable (already exists, just adding index)
  - Add `name` column as alias for better semantics (optional)

  ## 3. Changes to table_bookings
  - Ensure QR fields exist (qr_payload, qr_code, checked_in_at, check_in_count)
  - Ensure status constraint allows only: PENDING, PAID, CANCELLED
  - Ensure paid_at field exists
  - Remove any constraints that would block rebuy after cancellation

  ## 4. Availability Logic (Single Source of Truth)
  A table is UNAVAILABLE only if:
  - There exists a table_bookings record with status='PAID' for that table + event
  - OR the table's manual_status = 'SOLD'

  CANCELLED and PENDING bookings do NOT block availability.

  ## 5. Rebuy After Cancellation
  - Multiple CANCELLED bookings can exist for the same table+event
  - Each new purchase creates a new booking record
  - No unique constraint prevents rebuy

  ## 6. QR Code Flow
  - QR generation happens after payment confirmation
  - QR payload: {"v":1, "type":"TABLE", "booking_id":"...", "event_id":"...", "table_id":"..."}
  - QR is included in confirmation email
*/

-- ============================================================================
-- Part 1: Ensure floorplan_tables has proper structure
-- ============================================================================

-- The table_number field is already used as the name, so no changes needed
-- Just ensure we have proper indexes for performance

CREATE INDEX IF NOT EXISTS idx_floorplan_tables_active
ON floorplan_tables(is_active)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_floorplan_tables_table_number
ON floorplan_tables(table_number);

-- Add comment explaining table_number is the editable name
COMMENT ON COLUMN floorplan_tables.table_number IS 'Editable table name/identifier (e.g., "Tafel 1", "VIP Booth A", "Sta-tafel 3")';

-- ============================================================================
-- Part 2: Ensure table_bookings has all required QR fields
-- ============================================================================

-- These may already exist from previous migrations, but we ensure they're there
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'table_bookings' AND column_name = 'qr_payload'
  ) THEN
    ALTER TABLE table_bookings ADD COLUMN qr_payload jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'table_bookings' AND column_name = 'qr_code'
  ) THEN
    ALTER TABLE table_bookings ADD COLUMN qr_code text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'table_bookings' AND column_name = 'checked_in_at'
  ) THEN
    ALTER TABLE table_bookings ADD COLUMN checked_in_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'table_bookings' AND column_name = 'check_in_count'
  ) THEN
    ALTER TABLE table_bookings ADD COLUMN check_in_count integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'table_bookings' AND column_name = 'paid_at'
  ) THEN
    ALTER TABLE table_bookings ADD COLUMN paid_at timestamptz;
  END IF;
END $$;

-- ============================================================================
-- Part 3: Ensure status constraint is correct
-- ============================================================================

-- Drop old constraint if it exists
ALTER TABLE table_bookings DROP CONSTRAINT IF EXISTS table_bookings_status_check;

-- Add correct constraint: only PENDING, PAID, CANCELLED
ALTER TABLE table_bookings
ADD CONSTRAINT table_bookings_status_check
CHECK (status = ANY (ARRAY['PENDING'::text, 'PAID'::text, 'CANCELLED'::text]));

-- Set default to PENDING
ALTER TABLE table_bookings ALTER COLUMN status SET DEFAULT 'PENDING';

-- ============================================================================
-- Part 4: Remove any constraints that would block rebuy
-- ============================================================================

-- Check for and remove any unique constraint on (floorplan_table_id, event_id)
-- Multiple bookings (especially CANCELLED ones) should be allowed
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'table_bookings'::regclass
    AND contype = 'u'
    AND conname LIKE '%table%event%'
    OR conname LIKE '%floorplan%event%'
  LOOP
    EXECUTE format('ALTER TABLE table_bookings DROP CONSTRAINT IF EXISTS %I', constraint_name);
    RAISE NOTICE 'Dropped constraint: %', constraint_name;
  END LOOP;
END $$;

-- ============================================================================
-- Part 5: Ensure proper indexes for performance
-- ============================================================================

-- Index for QR payload lookups (may already exist)
CREATE INDEX IF NOT EXISTS idx_table_bookings_qr_payload
ON table_bookings USING gin(qr_payload);

-- Index for checking availability (critical for performance)
CREATE INDEX IF NOT EXISTS idx_table_bookings_availability
ON table_bookings(event_id, floorplan_table_id, status)
WHERE status = 'PAID';

-- Index for order lookups
CREATE INDEX IF NOT EXISTS idx_table_bookings_order_id
ON table_bookings(order_id)
WHERE order_id IS NOT NULL;

-- Index for booking code lookups
CREATE INDEX IF NOT EXISTS idx_table_bookings_booking_code
ON table_bookings(booking_code);

-- ============================================================================
-- Part 6: Add helpful comments
-- ============================================================================

COMMENT ON COLUMN table_bookings.status IS 'Booking status: PENDING (payment in progress), PAID (confirmed and paid), CANCELLED (cancelled by admin or abandoned). Only PAID bookings block table availability.';
COMMENT ON COLUMN table_bookings.qr_payload IS 'QR code payload in JSON format: {"v":1, "type":"TABLE", "booking_id":"...", "event_id":"...", "table_id":"..."}';
COMMENT ON COLUMN table_bookings.qr_code IS 'QR code image as data URL (base64 PNG)';
COMMENT ON COLUMN table_bookings.checked_in_at IS 'Timestamp when the booking was checked in at the event';
COMMENT ON COLUMN table_bookings.check_in_count IS 'Number of times check-in was attempted (should be 0 or 1)';
COMMENT ON COLUMN table_bookings.paid_at IS 'Timestamp when payment was confirmed';

-- ============================================================================
-- Part 7: Create helper function to check table availability
-- ============================================================================

CREATE OR REPLACE FUNCTION is_table_available(
  p_table_id uuid,
  p_event_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paid_booking_exists boolean;
  v_manual_status text;
BEGIN
  -- Check if there's a PAID booking for this table+event
  SELECT EXISTS(
    SELECT 1
    FROM table_bookings
    WHERE floorplan_table_id = p_table_id
    AND event_id = p_event_id
    AND status = 'PAID'
  ) INTO v_paid_booking_exists;

  IF v_paid_booking_exists THEN
    RETURN false;
  END IF;

  -- Check manual status
  SELECT manual_status
  INTO v_manual_status
  FROM floorplan_tables
  WHERE id = p_table_id;

  IF v_manual_status = 'SOLD' THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION is_table_available IS 'Check if a table is available for booking. Returns false if there is a PAID booking or manual_status is SOLD.';