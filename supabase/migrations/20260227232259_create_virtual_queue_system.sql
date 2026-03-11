/*
  # Virtual Waiting Room / Queue System

  1. New Tables
    - `queue_sessions`
      - `id` (uuid, primary key)
      - `event_id` (uuid, not null) - which event this session belongs to
      - `token` (text, not null) - unique browser token from localStorage
      - `status` (text, not null) - 'waiting' or 'admitted'
      - `created_at` (timestamptz) - when user first joined queue
      - `last_seen_at` (timestamptz) - heartbeat timestamp
      - `admitted_at` (timestamptz) - when user was admitted

    - `queue_settings`
      - `event_id` (uuid, primary key) - one row per event
      - `cap` (integer, default 250) - max concurrent admitted users
      - `flow_per_min` (float8, default 40) - estimated throughput

  2. New Indexes
    - `idx_queue_sessions_event_status` on queue_sessions(event_id, status)
    - `idx_queue_sessions_token_event` unique on queue_sessions(token, event_id)

  3. New RPC
    - `join_queue` - upsert session, compute position, admit if under cap

  4. Security
    - RLS enabled on both tables
    - queue_sessions: authenticated service role only (called via RPC)
    - queue_settings: admin read/write
*/

-- Queue sessions table
CREATE TABLE IF NOT EXISTS public.queue_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  token text NOT NULL,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'admitted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  admitted_at timestamptz
);

ALTER TABLE public.queue_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_queue_sessions_event_status
  ON public.queue_sessions (event_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_sessions_token_event
  ON public.queue_sessions (token, event_id);

-- Queue settings table
CREATE TABLE IF NOT EXISTS public.queue_settings (
  event_id uuid PRIMARY KEY,
  cap integer NOT NULL DEFAULT 250,
  flow_per_min float8 NOT NULL DEFAULT 40
);

ALTER TABLE public.queue_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies: only service role can access these tables directly
-- The RPC function uses SECURITY DEFINER so it bypasses RLS

-- join_queue RPC function
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
  -- 1. Upsert session: insert or update last_seen_at
  INSERT INTO public.queue_sessions (event_id, token, status, last_seen_at)
  VALUES (p_event_id, p_token, 'waiting', now())
  ON CONFLICT (token, event_id) DO UPDATE
    SET last_seen_at = now()
  RETURNING id, status, created_at
  INTO v_session_id, v_session_status, v_session_created_at;

  -- 2. Count active admitted sessions (seen within last 30 seconds)
  SELECT count(*) INTO v_active_inside
  FROM public.queue_sessions
  WHERE event_id = p_event_id
    AND status = 'admitted'
    AND last_seen_at > now() - interval '30 seconds';

  -- 3. Get cap and flow_per_min from settings (defaults if not set)
  SELECT COALESCE(qs.cap, 250), COALESCE(qs.flow_per_min, 40)
  INTO v_cap, v_flow_per_min
  FROM public.queue_settings qs
  WHERE qs.event_id = p_event_id;

  IF v_cap IS NULL THEN
    v_cap := 250;
    v_flow_per_min := 40;
  END IF;

  -- 4. If already admitted, keep admitted
  IF v_session_status = 'admitted' THEN
    -- Position 0 means you're inside
    RETURN jsonb_build_object(
      'status', 'admitted',
      'position', 0,
      'active_inside', v_active_inside,
      'cap', v_cap,
      'flow_per_min', v_flow_per_min,
      'eta_minutes', 0
    );
  END IF;

  -- 5. If active_inside < cap, admit this session
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

  -- 6. Still waiting: compute position
  -- Position = count of waiting sessions created before this one that are active (seen within 2 min)
  SELECT count(*) INTO v_position
  FROM public.queue_sessions
  WHERE event_id = p_event_id
    AND status = 'waiting'
    AND last_seen_at > now() - interval '2 minutes'
    AND created_at < v_session_created_at;

  -- Add 1 for this session's own position (1-based)
  v_position := v_position + 1;

  -- 7. ETA
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
