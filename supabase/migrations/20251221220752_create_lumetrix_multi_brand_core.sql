/*
  # Lumetrix Events Ticket Core - Multi-Brand Platform

  ## Overview
  Transform existing Eskiler backend into a reusable multi-brand ticket platform.
  
  ## Changes
  
  ### 1. Enhanced Events Table
    - Add brand column (eskiler, ravemania, etc.)
    - Add scan time windows
    - Add venue fields
    
  ### 2. New Tables
    - user_roles: Role-based access control
    - staff_invites: Staff invitation system
    
  ### 3. Enhanced Tickets Table
    - Add brand column
    - Add secure_token column
    
  ## Security
    - RLS enabled on new tables
    - Function-based access control
    
  ## Notes
    - All existing functionality preserved
    - Backward compatible with current flows
    - Eskiler is the first brand on this platform
*/

-- ============================================================================
-- 1. ENHANCE EVENTS TABLE
-- ============================================================================

-- Add brand column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'brand'
  ) THEN
    ALTER TABLE events ADD COLUMN brand text DEFAULT 'eskiler';
    CREATE INDEX idx_events_brand ON events(brand);
  END IF;
END $$;

-- Add venue_name if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'venue_name'
  ) THEN
    ALTER TABLE events ADD COLUMN venue_name text;
    UPDATE events SET venue_name = location WHERE venue_name IS NULL;
  END IF;
END $$;

-- Add venue_address if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'venue_address'
  ) THEN
    ALTER TABLE events ADD COLUMN venue_address text;
    UPDATE events SET venue_address = location_address WHERE venue_address IS NULL;
  END IF;
END $$;

-- Add event_start if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'event_start'
  ) THEN
    ALTER TABLE events ADD COLUMN event_start timestamptz;
    UPDATE events SET event_start = start_date WHERE event_start IS NULL;
  END IF;
END $$;

-- Add event_end if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'event_end'
  ) THEN
    ALTER TABLE events ADD COLUMN event_end timestamptz;
    UPDATE events SET event_end = end_date WHERE event_end IS NULL;
  END IF;
END $$;

-- Add scan_open_at if it doesn't exist  
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'scan_open_at'
  ) THEN
    ALTER TABLE events ADD COLUMN scan_open_at timestamptz;
    UPDATE events SET scan_open_at = event_start - interval '2 hours' WHERE scan_open_at IS NULL AND event_start IS NOT NULL;
  END IF;
END $$;

-- Add scan_close_at if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'scan_close_at'
  ) THEN
    ALTER TABLE events ADD COLUMN scan_close_at timestamptz;
    UPDATE events SET scan_close_at = event_end + interval '4 hours' WHERE scan_close_at IS NULL AND event_end IS NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- 2. ENHANCE TICKETS TABLE
-- ============================================================================

-- Add brand column to tickets if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'brand'
  ) THEN
    ALTER TABLE tickets ADD COLUMN brand text DEFAULT 'eskiler';
    CREATE INDEX idx_tickets_brand ON tickets(brand);
  END IF;
END $$;

-- Add secure_token column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'secure_token'
  ) THEN
    ALTER TABLE tickets ADD COLUMN secure_token text;
    UPDATE tickets SET secure_token = token WHERE secure_token IS NULL;
    CREATE INDEX idx_tickets_secure_token ON tickets(secure_token);
  END IF;
END $$;

-- ============================================================================
-- 3. USER ROLES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('super_admin', 'admin', 'scanner')),
  brand text,
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_unique_scope 
  ON user_roles(user_id, role, COALESCE(brand, ''), COALESCE(event_id::text, ''));

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);
CREATE INDEX IF NOT EXISTS idx_user_roles_brand ON user_roles(brand);
CREATE INDEX IF NOT EXISTS idx_user_roles_event_id ON user_roles(event_id);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own roles" ON user_roles;
CREATE POLICY "Users can read own roles"
  ON user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Super admins can read all roles" ON user_roles;
CREATE POLICY "Super admins can read all roles"
  ON user_roles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
    )
  );

-- ============================================================================
-- 4. STAFF INVITES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS staff_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'scanner')),
  brand text,
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  invite_token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'base64'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  invited_by uuid,
  created_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_staff_invites_email ON staff_invites(email);
CREATE INDEX IF NOT EXISTS idx_staff_invites_token ON staff_invites(invite_token);
CREATE INDEX IF NOT EXISTS idx_staff_invites_status ON staff_invites(status);
CREATE INDEX IF NOT EXISTS idx_staff_invites_brand ON staff_invites(brand);
CREATE INDEX IF NOT EXISTS idx_staff_invites_event_id ON staff_invites(event_id);

ALTER TABLE staff_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read invites" ON staff_invites;
CREATE POLICY "Admins can read invites"
  ON staff_invites FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid() 
      AND ur.role IN ('super_admin', 'admin')
    )
  );

-- ============================================================================
-- 5. HELPER FUNCTIONS
-- ============================================================================

-- Function to check if user has a specific role
CREATE OR REPLACE FUNCTION has_role(
  check_user_id uuid,
  check_role text,
  check_brand text DEFAULT NULL,
  check_event_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = check_user_id
    AND role = check_role
    AND (check_brand IS NULL OR brand = check_brand OR brand IS NULL)
    AND (check_event_id IS NULL OR event_id = check_event_id OR event_id IS NULL)
  );
END;
$$;

-- Function to check if user is super admin
CREATE OR REPLACE FUNCTION is_super_admin(check_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN has_role(check_user_id, 'super_admin');
END;
$$;

-- Function to get accessible event IDs for a user
CREATE OR REPLACE FUNCTION get_accessible_event_ids(check_user_id uuid)
RETURNS TABLE(event_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF is_super_admin(check_user_id) THEN
    RETURN QUERY SELECT id FROM events WHERE is_active = true;
  ELSE
    RETURN QUERY 
      SELECT DISTINCT ur.event_id 
      FROM user_roles ur
      WHERE ur.user_id = check_user_id 
      AND ur.event_id IS NOT NULL;
  END IF;
END;
$$;

-- ============================================================================
-- 6. ADD EMAIL_SENT FIELDS TO ORDERS (FOR TRACKING)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'email_sent'
  ) THEN
    ALTER TABLE orders ADD COLUMN email_sent boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'email_sent_at'
  ) THEN
    ALTER TABLE orders ADD COLUMN email_sent_at timestamptz;
  END IF;
END $$;