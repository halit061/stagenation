CREATE OR REPLACE FUNCTION atomic_rollback_ticket_stock(
  p_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_type_id uuid;
  v_count integer;
  v_has_tickets boolean := false;
  v_metadata jsonb;
  v_cart_item jsonb;
BEGIN
  -- Approach 1: Count actually created tickets (if they exist)
  FOR v_ticket_type_id, v_count IN
    SELECT ticket_type_id, COUNT(*)::integer
    FROM tickets
    WHERE order_id = p_order_id
      AND ticket_type_id IS NOT NULL
    GROUP BY ticket_type_id
  LOOP
    v_has_tickets := true;
    UPDATE ticket_types
    SET quantity_sold = GREATEST(0, COALESCE(quantity_sold, 0) - v_count)
    WHERE id = v_ticket_type_id;
  END LOOP;

  -- Approach 2: If no tickets were found, maybe checkout failed before tickets were created?
  -- In that case, we should look at the order's metadata.cart or reserved_items
  IF NOT v_has_tickets THEN
    SELECT metadata INTO v_metadata
    FROM orders
    WHERE id = p_order_id;
    
    -- Try to rollback based on the cart in metadata
    IF v_metadata IS NOT NULL AND v_metadata ? 'cart' THEN
      FOR v_cart_item IN SELECT * FROM jsonb_array_elements(v_metadata->'cart')
      LOOP
        v_ticket_type_id := (v_cart_item->>'ticket_type_id')::uuid;
        v_count := (v_cart_item->>'quantity')::integer;
        
        UPDATE ticket_types
        SET quantity_sold = GREATEST(0, COALESCE(quantity_sold, 0) - v_count)
        WHERE id = v_ticket_type_id;
      END LOOP;
    END IF;
  END IF;
END;
$$;
