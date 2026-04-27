/*
  # Revoke EXECUTE on admin-only / service-role-only SECURITY DEFINER functions

  ## Background
  Bolt's security advisor flagged 80 warnings about SECURITY DEFINER functions being
  callable by the `anon` and `authenticated` roles via PostgREST. Many of these are
  legitimate (seat picker, mailing list, RLS helpers) but a subset is intended to be
  called only by edge functions (using the service_role key) or by admins. This
  migration revokes EXECUTE on those for anon/authenticated, while leaving everything
  the frontend actually uses untouched.

  ## What this migration does
  1. Revokes EXECUTE on 18 service-role-only RPCs from anon AND authenticated.
     These are only invoked by edge functions which use service_role and bypass
     EXECUTE checks.
  2. Revokes EXECUTE on 3 trigger-only functions from anon AND authenticated.
     Triggers run with definer privileges regardless; revoking direct invocation
     does not affect trigger firing.
  3. Revokes EXECUTE on 2 admin-only RPCs (`copy_template_for_event`,
     `list_user_roles_with_email`) from anon only. Authenticated admins keep
     access because the admin UI calls these directly from the browser.

  ## What is intentionally NOT revoked (would break the live site)
  - Seat picker RPCs (hold_seats_atomic, extend_seat_holds, release_session_holds,
    release_single_seat_hold, release_expired_holds, release_expired_reservations,
    check_seat_hold_rate_limit) — frontend calls these with anon key.
  - `add_to_mailing_list` — public newsletter form.
  - RLS helper functions (is_super_admin, is_admin_or_super, has_role, 
    get_accessible_event_ids, get_current_brand_id) — required by RLS policies;
    revoking would break every protected table.

  ## Security impact
  - Closes the most critical exposure: `grant_super_admin` is no longer callable
    by random anon traffic. Same for bulk_create_tickets, reserve_tickets,
    inventory mutations, drink stock mutations, promo usage, and order conversion.
  - service_role is unaffected, so all edge functions continue to work normally.
*/

-- Revoke from anon AND authenticated (service-role-only RPCs)
REVOKE EXECUTE ON FUNCTION public.grant_super_admin(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bulk_create_tickets(uuid, uuid, integer, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_guest_seats_atomic(uuid[], uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.atomic_book_tables(uuid[], uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_tables_for_order(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.atomic_decrement_ticket_stock(uuid, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.atomic_rollback_ticket_stock(uuid, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rollback_ticket_stock(uuid, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_tickets(uuid, jsonb, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.convert_reservation_to_sold(uuid, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_seat_order_atomic(uuid, text, text, text, text, numeric, numeric, numeric, text, text, text, uuid[], numeric[]) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_seat_order_pending(uuid, text, text, text, text, numeric, numeric, numeric, text, text, text, uuid[], numeric[], uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_seat_order_pending_v2(uuid, text, text, text, text, numeric, numeric, numeric, text, text, text, uuid[], numeric[], uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deduct_drink_stock(uuid, uuid, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_drink_order_display_code(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_drink_order_delivered(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_promo_usage(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM anon, authenticated;

-- Revoke from anon AND authenticated (trigger-only functions; triggers fire regardless)
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_table_booking_table_number() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_seat_ticket_number() FROM anon, authenticated;

-- Revoke from anon only (admin frontend uses authenticated)
REVOKE EXECUTE ON FUNCTION public.copy_template_for_event(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_user_roles_with_email() FROM anon;
