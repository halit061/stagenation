/*
  # Add Scanner System Tables
  
  This migration adds the complete scanner system tables that are missing
  from the current setup.
  
  ## New Tables
    - scanner_users: Scanner device/user tracking
    - scanner_sessions: Active scanner login sessions
    - scan_logs: Detailed ticket scan history and validation logs
    - venues: Physical venue information
    - locations: Legacy location support
    
  ## Security
    - RLS enabled on all tables
    - Scanner users can only view their own sessions and logs
    - Admins can view all scanner activity
*/

-- ============================================================================
-- VENUES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  postal_code text,
  country text NOT NULL DEFAULT 'Belgium',
  capacity integer,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venues_city ON venues(city);

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read venues"
  ON venues FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can manage venues"
  ON venues FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- LOCATIONS TABLE (Legacy Support)
-- ============================================================================

CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  country text DEFAULT 'Belgium',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read locations"
  ON locations FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can manage locations"
  ON locations FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- SCANNER USERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS scanner_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL,
  device_id text,
  device_info jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  last_active_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scanner_users_user_id ON scanner_users(user_id);
CREATE INDEX IF NOT EXISTS idx_scanner_users_email ON scanner_users(email);
CREATE INDEX IF NOT EXISTS idx_scanner_users_device_id ON scanner_users(device_id);
CREATE INDEX IF NOT EXISTS idx_scanner_users_is_active ON scanner_users(is_active);

ALTER TABLE scanner_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Scanner users can view own profile"
  ON scanner_users FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all scanner users"
  ON scanner_users FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "Admins can manage scanner users"
  ON scanner_users FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

-- ============================================================================
-- SCANNER SESSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS scanner_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scanner_user_id uuid NOT NULL REFERENCES scanner_users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  session_token text UNIQUE NOT NULL,
  device_info jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_scanner_sessions_scanner_user_id ON scanner_sessions(scanner_user_id);
CREATE INDEX IF NOT EXISTS idx_scanner_sessions_event_id ON scanner_sessions(event_id);
CREATE INDEX IF NOT EXISTS idx_scanner_sessions_session_token ON scanner_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_scanner_sessions_is_active ON scanner_sessions(is_active);

ALTER TABLE scanner_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Scanner users can view own sessions"
  ON scanner_sessions FOR SELECT
  TO authenticated
  USING (
    scanner_user_id IN (
      SELECT id FROM scanner_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all sessions"
  ON scanner_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "Scanner users can create sessions"
  ON scanner_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    scanner_user_id IN (
      SELECT id FROM scanner_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Scanner users can update own sessions"
  ON scanner_sessions FOR UPDATE
  TO authenticated
  USING (
    scanner_user_id IN (
      SELECT id FROM scanner_users WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    scanner_user_id IN (
      SELECT id FROM scanner_users WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- SCAN LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS scan_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES tickets(id) ON DELETE SET NULL,
  scanner_user_id uuid REFERENCES scanner_users(id) ON DELETE SET NULL,
  scanner_session_id uuid REFERENCES scanner_sessions(id) ON DELETE SET NULL,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  scan_result text NOT NULL CHECK (scan_result IN ('valid', 'already_used', 'invalid', 'revoked', 'expired', 'wrong_event', 'not_yet_open', 'event_closed')),
  ticket_number text,
  token_scanned text,
  location_id text,
  device_info jsonb DEFAULT '{}'::jsonb,
  latitude numeric,
  longitude numeric,
  scanned_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_scan_logs_ticket_id ON scan_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_scanner_user_id ON scan_logs(scanner_user_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_scanner_session_id ON scan_logs(scanner_session_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_event_id ON scan_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_scanned_at ON scan_logs(scanned_at);
CREATE INDEX IF NOT EXISTS idx_scan_logs_scan_result ON scan_logs(scan_result);

ALTER TABLE scan_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Scanner users can view own scan logs"
  ON scan_logs FOR SELECT
  TO authenticated
  USING (
    scanner_user_id IN (
      SELECT id FROM scanner_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all scan logs"
  ON scan_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "Scanner users can create scan logs"
  ON scan_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    scanner_user_id IN (
      SELECT id FROM scanner_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "System can create scan logs"
  ON scan_logs FOR INSERT
  WITH CHECK (true);