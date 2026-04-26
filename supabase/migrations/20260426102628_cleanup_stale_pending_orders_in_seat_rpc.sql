/*
  # Auto-cleanup stale pending orders in create_seat_order_pending_v2

  ## Problem
  When a user starts a seat order, the RPC inserts ticket_seats rows. If the user
  abandons the flow before paying, the pending order persists and its ticket_seats
  rows remain — blocking the unique constraint ticket_seats_seat_id_event_id_key
  for any future order on the same seat. This caused 500 errors when a customer
  tried to re-checkout the same seat.

  ## Changes
  1. Data cleanup
    - Cancel any pending orders older than 15 minutes for the seats currently being checked out
    - Delete their ticket_seats rows
    - Free the seats back to 'available'
  2. RPC patch
    - At the start of create_seat_order_pending_v2, after seat row-locking but
      before inserting the new ticket_seats, automatically clean up any expired
      pending orders that hold the requested seats

  ## Security
  - No RLS changes; function remains SECURITY DEFINER with search_path=public
*/

-- One-time cleanup of any currently stuck pending orders older than 15 minutes
DO $cleanup$
DECLARE
  v_order_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_order_ids
  FROM orders
  WHERE status = 'pending'
    AND created_at < NOW() - INTERVAL '15 minutes';

  IF v_order_ids IS NOT NULL AND array_length(v_order_ids, 1) > 0 THEN
    UPDATE seats
    SET status = 'available'
    WHERE id IN (SELECT seat_id FROM ticket_seats WHERE order_id = ANY(v_order_ids))
      AND status = 'reserved';

    DELETE FROM ticket_seats WHERE order_id = ANY(v_order_ids);

    UPDATE orders SET status = 'cancelled' WHERE id = ANY(v_order_ids);
  END IF;
END
$cleanup$;

-- Patch the RPC to auto-cleanup stale pending orders before inserting ticket_seats
CREATE OR REPLACE FUNCTION public.create_seat_order_pending_v2(
  p_event_id uuid,
  p_customer_first_name text,
  p_customer_last_name text,
  p_customer_email text,
  p_customer_phone text DEFAULT NULL::text,
  p_subtotal numeric DEFAULT 0,
  p_service_fee numeric DEFAULT 0,
  p_total_amount numeric DEFAULT 0,
  p_payment_method text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_session_id text DEFAULT NULL::text,
  p_seat_ids uuid[] DEFAULT '{}'::uuid[],
  p_seat_prices numeric[] DEFAULT '{}'::numeric[],
  p_ticket_type_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

v_stale_order_ids UUID[];
BEGIN
v_seat_count := COALESCE(array_length(p_seat_ids, 1), 0);
IF v_seat_count = 0 THEN
RETURN jsonb_build_object('success', false, 'error', 'no_seats');
END IF;

PERFORM id FROM seats WHERE id = ANY(p_seat_ids) FOR UPDATE;

-- Auto-cleanup any stale pending orders that block these seats
SELECT array_agg(DISTINCT ts.order_id)
INTO v_stale_order_ids
FROM ticket_seats ts
JOIN orders o ON o.id = ts.order_id
WHERE ts.seat_id = ANY(p_seat_ids)
  AND ts.event_id = p_event_id
  AND o.status = 'pending'
  AND o.created_at < NOW() - INTERVAL '15 minutes';

IF v_stale_order_ids IS NOT NULL AND array_length(v_stale_order_ids, 1) > 0 THEN
  DELETE FROM ticket_seats WHERE order_id = ANY(v_stale_order_ids);
  UPDATE orders SET status = 'cancelled' WHERE id = ANY(v_stale_order_ids);
  UPDATE seats SET status = 'available'
  WHERE id = ANY(p_seat_ids) AND status = 'reserved';
END IF;

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
$function$;
