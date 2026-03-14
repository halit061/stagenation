/*
  # Fix table_bookings status constraint

  ## Problem
  The edge functions (mollie-webhook, send-table-guest, create-table-order,
  check-in-table-booking, validate-table-booking) use status values like
  'paid', 'PAID', 'pending', 'PENDING' but the constraint only allows
  'available', 'sold', 'cancelled'.

  This mismatch causes all table booking payment flows to fail silently
  (the UPDATE is rejected by the DB constraint).

  ## Fix
  Expand the allowed status values to include all values used in the codebase.
  The status values used are:
  - 'available' - table is available to book
  - 'pending' / 'PENDING' - booking created, awaiting payment
  - 'paid' / 'PAID' - payment confirmed
  - 'sold' - legacy/alias for paid
  - 'cancelled' - booking cancelled
  - 'on_hold' - temporarily held
  - 'reserved' - reserved but not paid

  We normalize to lowercase consistent values.
*/

ALTER TABLE public.table_bookings
  DROP CONSTRAINT IF EXISTS table_bookings_status_check;

ALTER TABLE public.table_bookings
  ADD CONSTRAINT table_bookings_status_check
  CHECK (status = ANY (ARRAY[
    'available'::text,
    'pending'::text,
    'paid'::text,
    'sold'::text,
    'cancelled'::text,
    'on_hold'::text,
    'reserved'::text
  ]));

NOTIFY pgrst, 'reload schema';
