/*
  # Fix create_seat_order_pending RPC accessibility

  1. Problem
    - PostgREST returns 404 for create_seat_order_pending RPC
    - Function exists but schema cache may be stale

  2. Fix
    - Re-create the function with CREATE OR REPLACE to ensure it is fresh
    - Re-grant EXECUTE to anon, authenticated, service_role
    - Reload PostgREST schema cache via NOTIFY
*/

CREATE OR REPLACE FUNCTION public.create_seat_order_pending(
  p_event_id uuid,
  p_customer_first_name text,
  p_customer_last_name text,
  p_customer_email text,
  p_customer_phone text DEFAULT NULL,
  p_subtotal numeric DEFAULT 0,
  p_service_fee numeric DEFAULT 0,
  p_total_amount numeric DEFAULT 0,
  p_payment_method text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_session_id text DEFAULT NULL,
  p_seat_ids uuid[] DEFAULT NULL,
  p_seat_prices numeric[] DEFAULT NULL,
  p_ticket_type_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order_id uuid;
  v_order_number text;
  v_verification_code text;
  v_ticket_id uuid;
  v_ticket_number text;
  v_seq_val bigint;
  v_year text;
  v_active_count integer;
  v_seat_count integer;
  v_ticket_code text;
  v_seat record;
  v_section_name text;
  v_row_label text;
  v_seat_number integer;
  v_qr_json text;
  i integer;
BEGIN
  IF p_seat_ids IS NULL OR array_length(p_seat_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_seats');
  END IF;

  IF p_seat_prices IS NULL OR array_length(p_seat_prices, 1) != array_length(p_seat_ids, 1) THEN
    RETURN jsonb_build_object('success', false, 'error', 'price_mismatch');
  END IF;

  v_seat_count := array_length(p_seat_ids, 1);

  SELECT count(*) INTO v_active_count
  FROM seat_holds
  WHERE session_id = p_session_id
    AND event_id = p_event_id
    AND status = 'held'
    AND expires_at > now()
    AND seat_id = ANY(p_seat_ids);

  IF v_active_count < v_seat_count THEN
    RETURN jsonb_build_object('success', false, 'error', 'holds_expired');
  END IF;

  PERFORM id FROM seats WHERE id = ANY(p_seat_ids) FOR UPDATE;

  v_year := to_char(now(), 'YYYY');
  v_seq_val := nextval('seat_order_seq');
  v_order_number := 'SN-' || v_year || '-' || lpad(v_seq_val::text, 5, '0');
  v_verification_code := generate_verification_code();

  INSERT INTO orders (
    event_id, order_number, payer_name, payer_email, payer_phone,
    total_amount, status, payment_provider, product_type,
    session_id, notes, service_fee_amount, verification_code, metadata
  ) VALUES (
    p_event_id,
    v_order_number,
    p_customer_first_name || ' ' || p_customer_last_name,
    p_customer_email,
    p_customer_phone,
    (p_total_amount * 100)::integer,
    'pending',
    'mollie',
    'seat',
    p_session_id,
    p_notes,
    p_service_fee,
    v_verification_code,
    jsonb_build_object(
      'customer_first_name', p_customer_first_name,
      'customer_last_name', p_customer_last_name,
      'subtotal', p_subtotal,
      'service_fee', p_service_fee,
      'seat_count', v_seat_count,
      'ticket_type_id', p_ticket_type_id
    )
  ) RETURNING id INTO v_order_id;

  v_ticket_number := v_order_number || '-T1';
  INSERT INTO tickets (
    order_id, event_id, ticket_type_id, ticket_number, token,
    status, holder_name, holder_email, product_type,
    metadata
  ) VALUES (
    v_order_id,
    p_event_id,
    COALESCE(p_ticket_type_id, '00000000-0000-0000-0000-000000000000'),
    v_ticket_number,
    encode(gen_random_bytes(16), 'hex'),
    'pending',
    p_customer_first_name || ' ' || p_customer_last_name,
    p_customer_email,
    'seat',
    jsonb_build_object('seat_count', v_seat_count, 'type', 'seat_order')
  ) RETURNING id INTO v_ticket_id;

  FOR i IN 1..v_seat_count LOOP
    SELECT s.row_label, s.seat_number, sec.name
    INTO v_row_label, v_seat_number, v_section_name
    FROM seats s
    JOIN seat_sections sec ON sec.id = s.section_id
    WHERE s.id = p_seat_ids[i];

    v_ticket_code := generate_ticket_code('SN');
    v_qr_json := jsonb_build_object(
      'ticket_code', v_ticket_code,
      'event_id', p_event_id,
      'order_id', v_order_id,
      'seat', COALESCE(v_section_name, '') || ' - ' || COALESCE(v_row_label, '?') || COALESCE(v_seat_number::text, '0'),
      'order_number', v_order_number
    )::text;

    INSERT INTO ticket_seats (ticket_id, seat_id, event_id, price_paid, order_id, ticket_code, qr_data)
    VALUES (v_ticket_id, p_seat_ids[i], p_event_id, p_seat_prices[i], v_order_id, v_ticket_code, v_qr_json);
  END LOOP;

  UPDATE seats SET status = 'reserved' WHERE id = ANY(p_seat_ids) AND status = 'available';

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'verification_code', v_verification_code,
    'total_amount_cents', (p_total_amount * 100)::integer
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_seat_order_pending TO anon;
GRANT EXECUTE ON FUNCTION public.create_seat_order_pending TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_seat_order_pending TO service_role;

NOTIFY pgrst, 'reload schema';
