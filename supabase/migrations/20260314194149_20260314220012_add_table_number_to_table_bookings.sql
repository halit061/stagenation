/*
  # Add table_number to table_bookings

  ## Problem
  BarOrders.tsx does: .select('*, table_bookings(table_number)')
  But table_bookings doesn't have a table_number column.
  The table_number lives on floorplan_tables.

  This adds a denormalized table_number field to table_bookings
  so the query works without complex nested joins.

  Also adds a trigger to auto-populate it when floorplan_table_id is set.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'table_bookings' AND column_name = 'table_number') THEN
    ALTER TABLE public.table_bookings ADD COLUMN table_number text;
  END IF;
END $$;

-- Backfill existing records
UPDATE public.table_bookings tb
SET table_number = ft.table_number
FROM public.floorplan_tables ft
WHERE tb.floorplan_table_id = ft.id
  AND tb.table_number IS NULL;

-- Trigger to auto-set table_number when floorplan_table_id is set
CREATE OR REPLACE FUNCTION public.sync_table_booking_table_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.floorplan_table_id IS NOT NULL THEN
    SELECT table_number INTO NEW.table_number
    FROM public.floorplan_tables
    WHERE id = NEW.floorplan_table_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_table_number_on_booking ON public.table_bookings;
CREATE TRIGGER sync_table_number_on_booking
  BEFORE INSERT OR UPDATE OF floorplan_table_id
  ON public.table_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_table_booking_table_number();

NOTIFY pgrst, 'reload schema';
