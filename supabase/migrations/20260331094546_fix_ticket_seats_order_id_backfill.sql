/*
  # Fix ticket_seats order_id column

  1. Changes
    - Backfill `order_id` from `ticket_id` for all existing rows where order_id is NULL
    - Update `create_seat_order_pending` RPC to set both `ticket_id` and `order_id`

  2. Notes
    - The RPC was only setting `ticket_id` with the order UUID, leaving `order_id` NULL
    - All downstream queries (webhook, email, frontend) use `order_id` to find seat tickets
    - This caused seats not being marked as sold and emails not being sent
*/

UPDATE ticket_seats
SET order_id = ticket_id
WHERE order_id IS NULL;

CREATE OR REPLACE FUNCTION public.create_seat_order_pending(
  p_event_id UUID,
  p_customer_first_name TEXT,
  p_customer_last_name TEXT,
  p_customer_email TEXT,
  p_customer_phone TEXT DEFAULT NULL,
  p_subtotal NUMERIC DEFAULT 0,
  p_service_fee NUMERIC DEFAULT 0,
  p_total_amount NUMERIC DEFAULT 0,
  p_payment_method TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_seat_ids UUID[] DEFAULT '{}',
  p_seat_prices NUMERIC[] DEFAULT '{}',
  p_ticket_type_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
  v_verification_code TEXT;
  v_seat RECORD;
  v_ticket_code TEXT;
  v_chars TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_random TEXT;
  v_i INTEGER;
  v_total_cents INTEGER;
  v_service_fee_cents INTEGER;
BEGIN
  v_order_number := 'SN-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD(nextval('order_number_seq')::TEXT, 5, '0');
  v_verification_code := LPAD(floor(random() * 1000000)::TEXT, 6, '0');
  v_total_cents := (p_total_amount * 100)::INTEGER;
  v_service_fee_cents := (p_service_fee * 100)::INTEGER;

  IF EXISTS (SELECT 1 FROM seats WHERE id = ANY(p_seat_ids) AND status NOT IN ('reserved','available')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stoelen niet beschikbaar');
  END IF;

  INSERT INTO orders (
    order_number, event_id, payer_name, payer_email, payer_phone,
    total_amount, service_fee_total_cents, service_fee_amount, service_fee,
    payment_method, status, payment_id,
    verification_code, session_id, notes, product_type
  ) VALUES (
    v_order_number, p_event_id,
    p_customer_first_name || ' ' || p_customer_last_name,
    p_customer_email, p_customer_phone,
    v_total_cents, v_service_fee_cents, p_service_fee, p_service_fee,
    p_payment_method, 'pending', NULL,
    v_verification_code, p_session_id, p_notes, 'seat'
  ) RETURNING id INTO v_order_id;

  FOR v_seat IN SELECT s.id, s.row_label, s.seat_number, COALESCE(s.price_override, sec.price_amount) as effective_price, sec.name as section_name FROM seats s JOIN seat_sections sec ON s.section_id = sec.id WHERE s.id = ANY(p_seat_ids)
  LOOP
    LOOP
      v_random := '';
      FOR v_i IN 1..6 LOOP v_random := v_random || substr(v_chars, floor(random()*length(v_chars)+1)::INTEGER, 1); END LOOP;
      v_ticket_code := 'SN-' || v_random;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM ticket_seats WHERE ticket_code = v_ticket_code);
    END LOOP;
    INSERT INTO ticket_seats (ticket_id, order_id, seat_id, event_id, price_paid, ticket_code, qr_data)
    VALUES (v_order_id, v_order_id, v_seat.id, p_event_id, v_seat.effective_price, v_ticket_code,
      jsonb_build_object('ticket_code', v_ticket_code, 'event_id', p_event_id, 'seat', v_seat.section_name||' - Rij '||v_seat.row_label||' - Stoel '||v_seat.seat_number, 'order_number', v_order_number)::TEXT);
  END LOOP;

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'order_number', v_order_number, 'verification_code', v_verification_code, 'total_amount_cents', v_total_cents);
END;
$$;
