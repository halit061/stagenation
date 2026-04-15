/*
  # Bulk Create Tickets Function
  
  ## Purpose
  Allows super_admin and admin users to bulk create tickets for events.
  Useful for guest lists, complimentary tickets, and pre-generated ticket batches.
  
  ## Function: bulk_create_tickets
  
  ### Input Parameters
  - p_event_id (uuid): Event for which to create tickets
  - p_ticket_type_id (uuid): Ticket type
  - p_quantity (integer): Number of tickets to create
  - p_prefix (text, optional): Prefix for ticket numbers (default: 'TKT')
  - p_status (text, optional): Initial status (default: 'valid')
  
  ### Returns
  JSON object with:
  - success (boolean)
  - tickets_created (integer)
  - event_id (uuid)
  - ticket_type_id (uuid)
  
  ### Security
  - Only super_admin and event admins can execute this function
  - Validates event and ticket type existence
  - Creates secure tokens for each ticket
*/

CREATE OR REPLACE FUNCTION bulk_create_tickets(
  p_event_id uuid,
  p_ticket_type_id uuid,
  p_quantity integer,
  p_prefix text DEFAULT 'TKT',
  p_status text DEFAULT 'valid'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_is_authorized boolean := false;
  v_event record;
  v_ticket_type record;
  v_created_count integer := 0;
  v_ticket_id uuid;
  v_ticket_number text;
  v_secure_token text;
  v_timestamp bigint;
  v_random_part text;
  v_brand text;
  i integer;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not authenticated'
    );
  END IF;
  
  -- Check authorization
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = v_user_id
    AND (
      role = 'super_admin'
      OR (role = 'admin' AND (event_id = p_event_id OR event_id IS NULL))
    )
  ) INTO v_is_authorized;
  
  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: requires super_admin or admin role'
    );
  END IF;
  
  -- Validate quantity
  IF p_quantity <= 0 OR p_quantity > 1000 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Quantity must be between 1 and 1000'
    );
  END IF;
  
  -- Validate status
  IF p_status NOT IN ('valid', 'pending') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Status must be either valid or pending'
    );
  END IF;
  
  -- Verify event exists
  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Event not found'
    );
  END IF;
  
  -- Verify ticket type exists and belongs to event
  SELECT * INTO v_ticket_type FROM ticket_types 
  WHERE id = p_ticket_type_id AND event_id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ticket type not found or does not belong to this event'
    );
  END IF;
  
  -- Get brand from event
  v_brand := COALESCE(v_event.brand, 'stagenation');
  
  -- Generate timestamp for ticket numbers
  v_timestamp := EXTRACT(EPOCH FROM NOW())::bigint;
  
  -- Create tickets in a loop
  FOR i IN 1..p_quantity LOOP
    -- Generate unique ticket ID
    v_ticket_id := gen_random_uuid();
    
    -- Generate random part for ticket number
    v_random_part := upper(substring(encode(gen_random_bytes(6), 'base64') from 1 for 8));
    v_random_part := replace(v_random_part, '/', 'X');
    v_random_part := replace(v_random_part, '+', 'Y');
    v_random_part := replace(v_random_part, '=', 'Z');
    
    -- Generate ticket number: PREFIX-TIMESTAMP-RANDOM-INDEX
    v_ticket_number := format('%s-%s-%s-%s', 
      p_prefix, 
      v_timestamp, 
      v_random_part,
      i
    );
    
    -- Generate secure token (random base64)
    v_secure_token := encode(gen_random_bytes(32), 'base64');
    v_secure_token := replace(v_secure_token, '/', '_');
    v_secure_token := replace(v_secure_token, '+', '-');
    v_secure_token := replace(v_secure_token, '=', '');
    
    -- Insert ticket (no order_id for bulk created tickets)
    INSERT INTO tickets (
      id,
      order_id,
      event_id,
      ticket_type_id,
      ticket_number,
      token,
      secure_token,
      status,
      brand,
      issued_at
    ) VALUES (
      v_ticket_id,
      '00000000-0000-0000-0000-000000000000'::uuid, -- Placeholder order ID
      p_event_id,
      p_ticket_type_id,
      v_ticket_number,
      v_secure_token,
      v_secure_token,
      p_status,
      v_brand,
      NOW()
    );
    
    v_created_count := v_created_count + 1;
  END LOOP;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', true,
    'tickets_created', v_created_count,
    'event_id', p_event_id,
    'ticket_type_id', p_ticket_type_id,
    'event_name', v_event.name,
    'ticket_type_name', v_ticket_type.name,
    'brand', v_brand
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION bulk_create_tickets TO authenticated;
