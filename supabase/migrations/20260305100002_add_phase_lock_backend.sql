-- Backend enforcement for ticket phase locking
-- Prevents purchasing tickets from a locked phase even if frontend is bypassed

CREATE OR REPLACE FUNCTION public.check_phase_lock(
  p_ticket_type_id uuid,
  p_event_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phase_group text;
  v_phase_order integer;
  v_prev_phase record;
  v_prev_available integer;
BEGIN
  -- Get this ticket type's phase info
  SELECT phase_group, phase_order
  INTO v_phase_group, v_phase_order
  FROM public.ticket_types
  WHERE id = p_ticket_type_id AND event_id = p_event_id;

  -- No phase_group or phase_order 0 = always available
  IF v_phase_group IS NULL OR v_phase_order IS NULL OR v_phase_order <= 1 THEN
    RETURN false; -- not locked
  END IF;

  -- Check if ALL previous phases in the same group are sold out
  FOR v_prev_phase IN
    SELECT id, quantity_total, quantity_sold, quantity_reserved
    FROM public.ticket_types
    WHERE event_id = p_event_id
      AND phase_group = v_phase_group
      AND phase_order < v_phase_order
      AND phase_order > 0
      AND is_active = true
    ORDER BY phase_order ASC
  LOOP
    v_prev_available := v_prev_phase.quantity_total - v_prev_phase.quantity_sold - v_prev_phase.quantity_reserved;
    IF v_prev_available > 0 THEN
      -- Previous phase still has stock → this phase is LOCKED
      RETURN true;
    END IF;
  END LOOP;

  -- All previous phases sold out → this phase is unlocked
  RETURN false;
END;
$$;

-- Now update reserve_tickets to enforce phase locking
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

    -- Row-level lock on ticket_type to prevent race conditions
    SELECT (tt.quantity_total - tt.quantity_sold - tt.quantity_reserved)
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

    -- Reserve the stock
    UPDATE public.ticket_types
    SET quantity_reserved = quantity_reserved + v_qty
    WHERE id = v_tt_id;
  END LOOP;

  -- Create the reserved order
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
