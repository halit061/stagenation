/*
  # Lower Queue Admission Cap from 250 to 100

  1. Modified Tables
    - `queue_settings`
      - Default `cap` changed from 250 to 100

  2. Modified Functions
    - `join_queue` 
      - Fallback cap changed from 250 to 100

  3. Rationale
    - With 250 concurrent admitted users, the checkout edge function can saturate 
      under burst conditions (Mollie API calls take 200-500ms each)
    - At 100 concurrent users with ~2s avg checkout time, we get ~50 checkouts/sec 
      sustained throughput = 3000 checkouts/min, well above the 500-in-5-min target
    - The queue system smoothly buffers excess demand with position + ETA display
    - Existing queue_settings rows for specific events are NOT modified (admin can 
      override per-event)

  4. Important Notes
    - Only changes the DEFAULT for new events and the fallback in join_queue
    - Existing per-event overrides in queue_settings table are preserved
    - No data loss or destructive operations
*/

-- Update default cap on queue_settings table
ALTER TABLE public.queue_settings ALTER COLUMN cap SET DEFAULT 100;

-- Update join_queue function with new fallback cap
CREATE OR REPLACE FUNCTION public.join_queue(
  p_event_id uuid,
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_session_status text;
  v_session_created_at timestamptz;
  v_active_inside bigint;
  v_cap integer;
  v_flow_per_min float8;
  v_position bigint;
  v_eta_minutes integer;
BEGIN
  INSERT INTO public.queue_sessions (event_id, token, status, last_seen_at)
  VALUES (p_event_id, p_token, 'waiting', now())
  ON CONFLICT (token, event_id) DO UPDATE
    SET last_seen_at = now()
  RETURNING id, status, created_at
  INTO v_session_id, v_session_status, v_session_created_at;

  SELECT count(*) INTO v_active_inside
  FROM public.queue_sessions
  WHERE event_id = p_event_id
    AND status = 'admitted'
    AND last_seen_at > now() - interval '30 seconds';

  SELECT COALESCE(qs.cap, 100), COALESCE(qs.flow_per_min, 40)
  INTO v_cap, v_flow_per_min
  FROM public.queue_settings qs
  WHERE qs.event_id = p_event_id;

  IF v_cap IS NULL THEN
    v_cap := 100;
    v_flow_per_min := 40;
  END IF;

  IF v_session_status = 'admitted' THEN
    RETURN jsonb_build_object(
      'status', 'admitted',
      'position', 0,
      'active_inside', v_active_inside,
      'cap', v_cap,
      'flow_per_min', v_flow_per_min,
      'eta_minutes', 0
    );
  END IF;

  IF v_active_inside < v_cap THEN
    UPDATE public.queue_sessions
    SET status = 'admitted', admitted_at = now()
    WHERE id = v_session_id;

    RETURN jsonb_build_object(
      'status', 'admitted',
      'position', 0,
      'active_inside', v_active_inside + 1,
      'cap', v_cap,
      'flow_per_min', v_flow_per_min,
      'eta_minutes', 0
    );
  END IF;

  SELECT count(*) INTO v_position
  FROM public.queue_sessions
  WHERE event_id = p_event_id
    AND status = 'waiting'
    AND last_seen_at > now() - interval '2 minutes'
    AND created_at < v_session_created_at;

  v_position := v_position + 1;

  v_eta_minutes := ceil(v_position::float8 / greatest(v_flow_per_min, 1));

  RETURN jsonb_build_object(
    'status', 'waiting',
    'position', v_position,
    'active_inside', v_active_inside,
    'cap', v_cap,
    'flow_per_min', v_flow_per_min,
    'eta_minutes', v_eta_minutes
  );
END;
$$;
