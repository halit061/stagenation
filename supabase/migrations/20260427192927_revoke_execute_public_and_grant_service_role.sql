/*
  # Properly revoke EXECUTE on admin/service-role-only SECURITY DEFINER functions

  ## Background
  Previous migration revoked EXECUTE from anon/authenticated, but Postgres
  defaults grant EXECUTE to PUBLIC, and both anon and authenticated inherit
  from PUBLIC. Revoking from those roles individually had no effect.

  ## Changes
  1. REVOKE EXECUTE FROM PUBLIC, anon, authenticated on:
     - 18 service-role-only RPCs (called only by edge functions)
     - 3 trigger-only functions (triggers fire regardless of EXECUTE grants)
  2. GRANT EXECUTE TO service_role explicitly so edge functions keep working.
  3. For copy_template_for_event and list_user_roles_with_email, only revoke
     from PUBLIC and anon, then re-grant to authenticated and service_role
     so admin UI continues to work.

  ## NOT touched (would break the live site)
  - Seat picker RPCs, mailing list, RLS helper functions.
*/

-- Service-role-only RPCs: revoke from everyone except service_role
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.grant_super_admin(text)',
    'public.bulk_create_tickets(uuid, uuid, integer, text, text)',
    'public.assign_guest_seats_atomic(uuid[], uuid)',
    'public.atomic_book_tables(uuid[], uuid, uuid)',
    'public.release_tables_for_order(uuid)',
    'public.atomic_decrement_ticket_stock(uuid, jsonb)',
    'public.atomic_rollback_ticket_stock(uuid, jsonb)',
    'public.rollback_ticket_stock(uuid, jsonb)',
    'public.reserve_tickets(uuid, jsonb, uuid)',
    'public.convert_reservation_to_sold(uuid, jsonb)',
    'public.create_seat_order_atomic(uuid, text, text, text, text, numeric, numeric, numeric, text, text, text, uuid[], numeric[])',
    'public.create_seat_order_pending(uuid, text, text, text, text, numeric, numeric, numeric, text, text, text, uuid[], numeric[], uuid)',
    'public.create_seat_order_pending_v2(uuid, text, text, text, text, numeric, numeric, numeric, text, text, text, uuid[], numeric[], uuid)',
    'public.deduct_drink_stock(uuid, uuid, integer)',
    'public.generate_drink_order_display_code(uuid)',
    'public.mark_drink_order_delivered(uuid, uuid)',
    'public.increment_promo_usage(uuid)',
    'public.check_rate_limit(text, integer, integer)',
    'public.update_updated_at_column()',
    'public.sync_table_booking_table_number()',
    'public.generate_seat_ticket_number()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

-- Admin-only RPCs (authenticated admin UI): revoke from anon/PUBLIC, keep authenticated
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.copy_template_for_event(uuid, uuid, text)',
    'public.list_user_roles_with_email()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;
