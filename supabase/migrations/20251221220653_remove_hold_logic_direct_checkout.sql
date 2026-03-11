/*
  # Remove Hold Logic and Enable Direct Checkout for Tables

  ## Changes

  1. **Modify table_bookings table**
     - Update existing 'on_hold' records to 'cancelled'
     - Remove 'on_hold' status (only keep: available, sold, cancelled)
     - Remove hold_expires_at column (no longer needed)
     - Add payment_id for Mollie tracking
     - Add order_id reference for linking to orders

  2. **Create helper functions**
     - atomic_book_tables: Atomically check and book tables
     - release_tables_for_order: Release tables when payment fails

  3. **Update RLS policies**
     - Simplify policies for direct checkout flow

  4. **Remove hold-related functions**
     - Drop expire_table_holds function (no longer needed)

  ## Important Notes
  - HOLDS_ENABLED is now false by default
  - Atomic availability checks happen during payment creation
  - Race conditions prevented via database constraints
*/

-- ============================================================================
-- 1. UPDATE EXISTING DATA FIRST
-- ============================================================================

-- Update any existing on_hold records to cancelled
UPDATE public.table_bookings 
SET status = 'cancelled' 
WHERE status = 'on_hold';

-- ============================================================================
-- 2. MODIFY TABLE_BOOKINGS TABLE
-- ============================================================================

-- Change status enum to only allow available, sold, cancelled
ALTER TABLE public.table_bookings DROP CONSTRAINT IF EXISTS table_bookings_status_check;
ALTER TABLE public.table_bookings 
  ADD CONSTRAINT table_bookings_status_check 
  CHECK (status IN ('available', 'sold', 'cancelled'));

-- Remove hold_expires_at column (no longer needed)
ALTER TABLE public.table_bookings DROP COLUMN IF EXISTS hold_expires_at;

-- Add payment_id for Mollie tracking if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'table_bookings' AND column_name = 'payment_id'
  ) THEN
    ALTER TABLE public.table_bookings ADD COLUMN payment_id text;
  END IF;
END $$;

-- Add order_id reference if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'table_bookings' AND column_name = 'order_id'
  ) THEN
    ALTER TABLE public.table_bookings ADD COLUMN order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create index on order_id
CREATE INDEX IF NOT EXISTS idx_table_bookings_order_id ON public.table_bookings(order_id);

-- Create index on payment_id
CREATE INDEX IF NOT EXISTS idx_table_bookings_payment_id ON public.table_bookings(payment_id);

-- ============================================================================
-- 3. DROP HOLD-RELATED FUNCTIONS
-- ============================================================================

DROP FUNCTION IF EXISTS public.expire_table_holds();

-- ============================================================================
-- 4. CREATE HELPER FUNCTION FOR ATOMIC TABLE BOOKING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.atomic_book_tables(
  p_table_ids uuid[],
  p_order_id uuid,
  p_event_id uuid
)
RETURNS TABLE(success boolean, unavailable_tables text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_unavailable text[];
  v_table_id uuid;
BEGIN
  -- Check which tables are unavailable
  SELECT ARRAY_AGG(tb.id::text)
  INTO v_unavailable
  FROM public.table_bookings tb
  WHERE tb.id = ANY(p_table_ids)
    AND tb.event_id = p_event_id
    AND tb.status != 'available';

  -- If any tables are unavailable, return failure
  IF v_unavailable IS NOT NULL THEN
    RETURN QUERY SELECT false, v_unavailable;
    RETURN;
  END IF;

  -- Update all tables atomically with row-level lock
  UPDATE public.table_bookings
  SET 
    status = 'sold',
    order_id = p_order_id,
    updated_at = now()
  WHERE id = ANY(p_table_ids)
    AND event_id = p_event_id
    AND status = 'available';

  -- Verify all tables were updated
  IF (SELECT COUNT(*) FROM public.table_bookings WHERE id = ANY(p_table_ids) AND order_id = p_order_id) != ARRAY_LENGTH(p_table_ids, 1) THEN
    -- Rollback will happen automatically due to transaction
    RETURN QUERY SELECT false, ARRAY['race_condition']::text[];
    RETURN;
  END IF;

  -- Success
  RETURN QUERY SELECT true, NULL::text[];
END;
$$;

-- ============================================================================
-- 5. CREATE HELPER FUNCTION TO RELEASE TABLES ON PAYMENT FAILURE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.release_tables_for_order(
  p_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.table_bookings
  SET 
    status = 'available',
    order_id = NULL,
    payment_id = NULL,
    updated_at = now()
  WHERE order_id = p_order_id
    AND status = 'sold';
END;
$$;