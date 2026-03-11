/*
  # Atomic Ticket Stock Functions

  1. New Functions
    - `atomic_decrement_ticket_stock` - atomically checks and decrements quantity_sold
      with row-level locking to prevent overselling
    - `rollback_ticket_stock` - rolls back quantity_sold if order creation or payment fails

  2. Important Notes
    - These replace the old reserve_tickets approach that used quantity_reserved
    - Stock is decremented at checkout time (when user clicks PAY)
    - If payment fails, stock is rolled back via rollback_ticket_stock
*/

-- Atomic decrement: lock rows, check availability, decrement quantity_sold
CREATE OR REPLACE FUNCTION public.atomic_decrement_ticket_stock(
  p_event_id uuid,
  p_items jsonb
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
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_tt_id := (v_item->>'ticket_type_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;

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

    UPDATE public.ticket_types
    SET quantity_sold = quantity_sold + v_qty
    WHERE id = v_tt_id;
  END LOOP;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Rollback: restore quantity_sold if something fails after decrement
CREATE OR REPLACE FUNCTION public.rollback_ticket_stock(
  p_event_id uuid,
  p_items jsonb
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
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_tt_id := (v_item->>'ticket_type_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;

    UPDATE public.ticket_types
    SET quantity_sold = GREATEST(0, quantity_sold - v_qty)
    WHERE id = v_tt_id AND event_id = p_event_id;
  END LOOP;

  RETURN jsonb_build_object('ok', true);
END;
$$;
