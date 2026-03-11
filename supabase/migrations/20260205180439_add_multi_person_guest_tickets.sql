/*
  # Multi-Person Guest Tickets Feature

  1. Changes to orders table
    - Add `persons_count` (integer, 1-9, default 1) - number of persons for guest tickets
    - Add `send_mode` (text, default 'per_person') - email sending mode

  2. New Tables
    - `guest_ticket_qrs`
      - `id` (uuid, primary key)
      - `event_id` (uuid, references events)
      - `order_id` (uuid, references orders - the parent guest ticket)
      - `person_index` (integer) - which person this QR is for (1-9)
      - `name` (text, nullable) - optional name for this person
      - `email` (text, nullable) - optional email for this person
      - `qr_token` (text, unique) - cryptographically secure token (48+ chars)
      - `used_at` (timestamptz, nullable) - when scanned
      - `used_by_scanner_id` (uuid, nullable) - scanner who scanned
      - `created_at` (timestamptz)

  3. Security
    - Enable RLS on guest_ticket_qrs
    - Policies for admins/superadmins to manage based on event access
*/

-- Add persons_count and send_mode to orders table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'persons_count'
  ) THEN
    ALTER TABLE orders ADD COLUMN persons_count integer NOT NULL DEFAULT 1;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'send_mode'
  ) THEN
    ALTER TABLE orders ADD COLUMN send_mode text NOT NULL DEFAULT 'per_person';
  END IF;
END $$;

-- Add check constraint for persons_count (1-9)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'orders' AND constraint_name = 'orders_persons_count_check'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_persons_count_check 
      CHECK (persons_count >= 1 AND persons_count <= 9);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add check constraint for send_mode
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'orders' AND constraint_name = 'orders_send_mode_check'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_send_mode_check 
      CHECK (send_mode IN ('per_person', 'single_email'));
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create guest_ticket_qrs table
CREATE TABLE IF NOT EXISTS guest_ticket_qrs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  person_index integer NOT NULL DEFAULT 1,
  name text,
  email text,
  qr_token text NOT NULL UNIQUE,
  used_at timestamptz,
  used_by_scanner_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT guest_ticket_qrs_person_index_check CHECK (person_index >= 1 AND person_index <= 9)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_guest_ticket_qrs_order_id ON guest_ticket_qrs(order_id);
CREATE INDEX IF NOT EXISTS idx_guest_ticket_qrs_event_id ON guest_ticket_qrs(event_id);
CREATE INDEX IF NOT EXISTS idx_guest_ticket_qrs_qr_token ON guest_ticket_qrs(qr_token);

-- Enable RLS
ALTER TABLE guest_ticket_qrs ENABLE ROW LEVEL SECURITY;

-- Create helper function to check if user can access event (if not exists)
CREATE OR REPLACE FUNCTION public.can_manage_event(check_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_id uuid;
  has_access boolean;
BEGIN
  user_id := auth.uid();
  IF user_id IS NULL THEN
    RETURN false;
  END IF;
  
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = can_manage_event.user_id
    AND (
      role IN ('superadmin', 'super_admin')
      OR (role IN ('admin', 'organizer') AND (event_id = check_event_id OR event_id IS NULL))
    )
  ) INTO has_access;
  
  RETURN has_access;
END;
$$;

-- RLS Policies for guest_ticket_qrs

-- Select: Admins can view QRs for events they can manage
CREATE POLICY "Admins can view guest ticket QRs"
  ON guest_ticket_qrs
  FOR SELECT
  TO authenticated
  USING (public.can_manage_event(event_id));

-- Insert: Admins can create QRs for events they can manage
CREATE POLICY "Admins can create guest ticket QRs"
  ON guest_ticket_qrs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_event(event_id));

-- Update: Admins can update QRs for events they can manage
CREATE POLICY "Admins can update guest ticket QRs"
  ON guest_ticket_qrs
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_event(event_id))
  WITH CHECK (public.can_manage_event(event_id));

-- Delete: Admins can delete unused QRs for events they can manage
CREATE POLICY "Admins can delete unused guest ticket QRs"
  ON guest_ticket_qrs
  FOR DELETE
  TO authenticated
  USING (public.can_manage_event(event_id) AND used_at IS NULL);
