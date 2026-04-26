/*
  # Create create_seat_order_pending_v2 — server-side amount validation

  Mirrors v1 (create_seat_order_pending) 1:1 in INSERT shape, order_number
  format, verification_code format, ticket_seats insert and return shape.
  ONLY difference vs v1: prices are derived server-side using the 4-step
  fallback (matching the frontend SeatCheckout.tsx 347-379), and the
  expected total is validated against p_total_amount with EUR 0.01 tolerance.

  v1 INSERT shape (verified via pg_get_functiondef):
    columns: order_number, event_id, payer_name, payer_email, payer_phone,
             total_amount, service_fee_total_cents, service_fee_amount,
             service_fee, payment_method, status, payment_id,
             verification_code, session_id, notes, product_type
    units:   total_amount = INTEGER cents
             service_fee_total_cents = INTEGER cents
             service_fee_amount = NUMERIC EUR
             service_fee = NUMERIC EUR

  Triggers on orders: only BEFORE UPDATE update_updated_at_column. No INSERT
  trigger reacts to total_amount value, so server-derived total is safe.

  v1 (create_seat_order_pending) is NOT modified — remains as rollback target.
*/

CREATE OR REPLACE FUNCTION create_seat_order_pending_v2(
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
  v_unavailable_count INTEGER;
  v_seat_count INTEGER;

  v_calc_subtotal NUMERIC := 0;
  v_fee_per_ticket NUMERIC := 0;
  v_calc_total NUMERIC := 0;
  v_service_fee_total NUMERIC := 0;

  v_fee_mode TEXT;
  v_fee_fixed NUMERIC;
  v_fee_percent NUMERIC;
  v_fee_base_price_cents INTEGER;
BEGIN
  v_seat_count := COALESCE(array_length(p_seat_ids, 1), 0);
  IF v_seat_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_seats');
  END IF;

  PERFORM id FROM seats WHERE id = ANY(p_seat_ids) FOR UPDATE;

  SELECT count(*) INTO v_unavailable_count
  FROM seats
  WHERE id = ANY(p_seat_ids)
    AND status NOT IN ('available', 'reserved');

  IF v_unavailable_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stoelen niet beschikbaar');
  END IF;

  WITH seat_input AS (
    SELECT s.id AS seat_id,
           s.section_id,
           s.ticket_type_id AS seat_ticket_type_id,
           s.price_override
    FROM seats s
    WHERE s.id = ANY(p_seat_ids)
  ),
  priced AS (
    SELECT
      si.seat_id,
      COALESCE(
        NULLIF(si.price_override, 0),
        (
          SELECT (tt.price::NUMERIC) / 100
          FROM ticket_types tt
          WHERE tt.id = si.seat_ticket_type_id
            AND tt.event_id = p_event_id
            AND COALESCE(tt.price, 0) > 0
          LIMIT 1
        ),
        (
          SELECT NULLIF(sec.price_amount, 0)
          FROM seat_sections sec
          WHERE sec.id = si.section_id
          LIMIT 1
        ),
        (
          SELECT (tt.price::NUMERIC) / 100
          FROM ticket_type_sections tts
          JOIN ticket_types tt ON tt.id = tts.ticket_type_id
          WHERE tts.section_id = si.section_id
            AND tt.event_id = p_event_id
            AND COALESCE(tt.price, 0) > 0
          ORDER BY tt.price ASC
          LIMIT 1
        ),
        0
      ) AS effective_price
    FROM seat_input si
  )
  SELECT COALESCE(SUM(effective_price), 0)
    INTO v_calc_subtotal
  FROM priced;

  SELECT tt.service_fee_mode,
         tt.service_fee_fixed,
         tt.service_fee_percent,
         tt.price
    INTO v_fee_mode, v_fee_fixed, v_fee_percent, v_fee_base_price_cents
  FROM ticket_types tt
  WHERE tt.event_id = p_event_id
    AND COALESCE(tt.is_active, true) = true
  ORDER BY tt.created_at ASC NULLS LAST, tt.id ASC
  LIMIT 1;

  IF v_fee_mode = 'fixed' THEN
    v_fee_per_ticket := COALESCE(v_fee_fixed, 0);
  ELSIF v_fee_mode = 'percent' THEN
    v_fee_per_ticket := ROUND(((COALESCE(v_fee_base_price_cents, 0)::NUMERIC / 100)
                               * COALESCE(v_fee_percent, 0) / 100)::NUMERIC, 2);
  ELSE
    v_fee_per_ticket := 0;
  END IF;

  v_service_fee_total := v_fee_per_ticket * v_seat_count;
  v_calc_total := v_calc_subtotal + v_service_fee_total;

  IF ABS(COALESCE(p_total_amount, 0) - v_calc_total) > 0.01 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'amount_mismatch',
      'expected', v_calc_total,
      'received', COALESCE(p_total_amount, 0)
    );
  END IF;

  v_total_cents := ROUND(v_calc_total * 100)::INTEGER;
  v_service_fee_cents := ROUND(v_service_fee_total * 100)::INTEGER;

  v_order_number := 'SN-' || EXTRACT(YEAR FROM now())::TEXT || '-'
                          || LPAD(nextval('order_number_seq')::TEXT, 5, '0');
  v_verification_code := LPAD(floor(random() * 1000000)::TEXT, 6, '0');

  INSERT INTO orders (
    order_number, event_id, payer_name, payer_email, payer_phone,
    total_amount, service_fee_total_cents, service_fee_amount, service_fee,
    payment_method, status, payment_id,
    verification_code, session_id, notes, product_type
  ) VALUES (
    v_order_number, p_event_id,
    p_customer_first_name || ' ' || p_customer_last_name,
    p_customer_email, p_customer_phone,
    v_total_cents, v_service_fee_cents, v_service_fee_total, v_service_fee_total,
    p_payment_method, 'pending', NULL,
    v_verification_code, p_session_id, p_notes, 'seat'
  ) RETURNING id INTO v_order_id;

  UPDATE seats SET status = 'reserved'
  WHERE id = ANY(p_seat_ids) AND status = 'available';

  FOR v_seat IN
    WITH seat_input AS (
      SELECT s.id AS seat_id,
             s.section_id,
             s.ticket_type_id AS seat_ticket_type_id,
             s.price_override,
             s.row_label,
             s.seat_number
      FROM seats s
      WHERE s.id = ANY(p_seat_ids)
    )
    SELECT
      si.seat_id AS id,
      si.row_label,
      si.seat_number,
      sec.name AS section_name,
      COALESCE(
        NULLIF(si.price_override, 0),
        (
          SELECT (tt.price::NUMERIC) / 100
          FROM ticket_types tt
          WHERE tt.id = si.seat_ticket_type_id
            AND tt.event_id = p_event_id
            AND COALESCE(tt.price, 0) > 0
          LIMIT 1
        ),
        (
          SELECT NULLIF(sec2.price_amount, 0)
          FROM seat_sections sec2
          WHERE sec2.id = si.section_id
          LIMIT 1
        ),
        (
          SELECT (tt.price::NUMERIC) / 100
          FROM ticket_type_sections tts
          JOIN ticket_types tt ON tt.id = tts.ticket_type_id
          WHERE tts.section_id = si.section_id
            AND tt.event_id = p_event_id
            AND COALESCE(tt.price, 0) > 0
          ORDER BY tt.price ASC
          LIMIT 1
        ),
        0
      ) AS effective_price
    FROM seat_input si
    JOIN seat_sections sec ON sec.id = si.section_id
  LOOP
    LOOP
      v_random := '';
      FOR v_i IN 1..6 LOOP
        v_random := v_random || substr(v_chars, floor(random()*length(v_chars)+1)::INTEGER, 1);
      END LOOP;
      v_ticket_code := 'SN-' || v_random;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM ticket_seats WHERE ticket_code = v_ticket_code);
    END LOOP;

    INSERT INTO ticket_seats (ticket_id, order_id, seat_id, event_id, price_paid, ticket_code, qr_data)
    VALUES (
      v_order_id, v_order_id, v_seat.id, p_event_id, v_seat.effective_price, v_ticket_code,
      jsonb_build_object(
        'ticket_code', v_ticket_code,
        'event_id', p_event_id,
        'seat', v_seat.section_name || ' - Rij ' || v_seat.row_label || ' - Stoel ' || v_seat.seat_number,
        'order_number', v_order_number
      )::TEXT
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'verification_code', v_verification_code,
    'total_amount_cents', v_total_cents
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_seat_order_pending_v2(
  UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC,
  TEXT, TEXT, TEXT, UUID[], NUMERIC[], UUID
) TO service_role, authenticated;
