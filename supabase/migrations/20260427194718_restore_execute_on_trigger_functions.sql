/*
  # Restore EXECUTE on trigger-only functions

  ## Problem
  Previous migration revoked EXECUTE from PUBLIC on three trigger functions:
  - update_updated_at_column()
  - sync_table_booking_table_number()
  - generate_seat_ticket_number()

  These functions are called by triggers fired during INSERT/UPDATE inside
  SECURITY DEFINER RPCs like create_seat_order_pending_v2. Those RPCs run as
  the function OWNER (postgres/supabase_admin), not as service_role. Because
  the OWNER inherits from PUBLIC and PUBLIC no longer has EXECUTE, the trigger
  call fails with "permission denied", which rolls back the entire transaction
  and breaks checkout (HTTP 403/500 from /functions/v1/create-seat-order).

  ## Fix
  Restore GRANT EXECUTE TO PUBLIC on the three trigger functions. They are
  trigger-only (no security risk in being callable directly — they just touch
  updated_at columns or generate ticket numbers, and require trigger context to
  do anything meaningful).

  ## What stays revoked (safe, no triggers)
  All 18 dangerous SECURITY DEFINER RPCs (grant_super_admin, bulk_create_tickets,
  reserve_tickets, create_seat_order_*, drink stock, promo, etc.) remain locked
  to service_role only. Those are called directly via /rest/v1/rpc and do not
  participate in trigger chains.
*/

GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_table_booking_table_number() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_seat_ticket_number() TO PUBLIC;
