-- Drop the existing function first so we can recreate it with the correct types if needed
DROP FUNCTION IF EXISTS public.reserve_tickets(uuid, jsonb, text, text, text, integer, text, jsonb);

CREATE OR REPLACE FUNCTION public.reserve_tickets(
  p_event_id uuid,
  p_items jsonb,
  p_customer_email text,
  p_customer_name text,
  p_customer_phone text DEFAULT '',
  p_hold_minutes integer DEFAULT 10,
  p_idempotency_key text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_tt_id uuid;
  v_qty integer;
  v_available integer;
  v_total_qty integer := 0;
  v_order_id uuid;
  v_order_number text;
  v_expires_at timestamptz;
  v_existing_order_id uuid;
  v_is_locked boolean;
BEGIN
  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_order_id
    FROM public.orders
    WHERE idempotency_key = p_idempotency_key
      AND status IN ('reserved', 'pending', 'paid')
    LIMIT 1;

    IF v_existing_order_id IS NOT NULL THEN
      SELECT jsonb_build_object(
        'order_id', o.id,
        'order_number', o.order_number,
        'expires_at', o.expires_at,
        'status', o.status,
        'already_exists', true
      ) INTO v_item
      FROM public.orders o WHERE o.id = v_existing_order_id;
      RETURN v_item;
    END IF;
  END IF;

  -- Lock and validate each ticket type
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_tt_id := (v_item->>'ticket_type_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    v_total_qty := v_total_qty + v_qty;

    -- Row-level lock on ticket_type to prevent race conditions during availability check
    -- Note: We now ONLY check quantity_sold (stock) - ignoring reserved!
    SELECT (tt.quantity_total - tt.quantity_sold)
    INTO v_available
    FROM public.ticket_types tt
    WHERE tt.id = v_tt_id AND tt.event_id = p_event_id
    FOR UPDATE;

    IF v_available IS NULL THEN
      RAISE EXCEPTION 'Ticket type not found: %', v_tt_id;
    END IF;

    IF v_available < v_qty THEN
      RAISE EXCEPTION 'Not enough tickets available for type %. Requested: %, Available: %', v_tt_id, v_qty, v_available;
    END IF;

    -- Phase lock check: prevent purchasing locked phases
    v_is_locked := public.check_phase_lock(v_tt_id, p_event_id);
    IF v_is_locked THEN
      RAISE EXCEPTION 'PHASE_LOCKED: Ticket type % is not yet available for purchase', v_tt_id;
    END IF;

    -- CHANGED: We are NO LONGER reserving stock.
    -- We just check if it's currently available, so the user can enter the checkout form.
    -- The actual stock deduction (quantity_sold) will happen atomically when they click "Pay" (create-ticket-checkout).
  END LOOP;

  -- Create the soft reserved order
  v_order_number := 'TKT-' || floor(extract(epoch from now()) * 1000)::text
                     || '-' || upper(substr(md5(random()::text), 1, 9));
  v_expires_at := now() + (p_hold_minutes || ' minutes')::interval;

  INSERT INTO public.orders (
    event_id, order_number, payer_email, payer_name, payer_phone,
    total_amount, status, payment_provider, expires_at, reserved_items,
    idempotency_key, metadata
  ) VALUES (
    p_event_id, v_order_number, p_customer_email, p_customer_name, p_customer_phone,
    0, 'reserved', 'mollie', v_expires_at, p_items,
    p_idempotency_key, p_metadata
  )
  RETURNING id INTO v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'expires_at', v_expires_at,
    'total_qty', v_total_qty,
    'already_exists', false
  );
END;
$$;


-- Now fix convert_reservation_to_sold so it only increments quantity_sold, and no longer subtracts quantity_reserved
CREATE OR REPLACE FUNCTION public.convert_reservation_to_sold(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_item jsonb;
  v_tt_id uuid;
  v_qty integer;
  v_available integer;
BEGIN
  -- Fetch and lock the order
  SELECT id, event_id, reserved_items, status, expires_at
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  IF v_order.status != 'reserved' THEN
    RAISE EXCEPTION 'Order is not in reserved status: %', v_order.status;
  END IF;

  -- Check if reservation has expired
  IF v_order.expires_at IS NOT NULL AND v_order.expires_at < now() THEN
    RAISE EXCEPTION 'Reservation has expired for order: %', p_order_id;
  END IF;

  IF v_order.reserved_items IS NULL THEN
    RAISE EXCEPTION 'No reserved items found for order: %', p_order_id;
  END IF;

  -- Verify and deduct stock atomically at checkout time!
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_order.reserved_items)
  LOOP
    v_tt_id := (v_item->>'ticket_type_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;

    SELECT (tt.quantity_total - tt.quantity_sold)
    INTO v_available
    FROM public.ticket_types tt
    WHERE tt.id = v_tt_id AND tt.event_id = v_order.event_id
    FOR UPDATE;
    
    IF v_available IS NULL THEN
      RAISE EXCEPTION 'Ticket type not found: %', v_tt_id;
    END IF;

    IF v_available < v_qty THEN
      RAISE EXCEPTION 'Not enough tickets available for type %. Requested: %, Available: %', v_tt_id, v_qty, v_available;
    END IF;

    UPDATE public.ticket_types
    SET quantity_sold = quantity_sold + v_qty
    WHERE id = v_tt_id
      AND event_id = v_order.event_id;
  END LOOP;

  -- Update order status from reserved to pending (ready for payment)
  UPDATE public.orders
  SET status = 'pending',
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id);
END;
$$;
