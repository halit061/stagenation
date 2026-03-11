/*
  # Create Table Guests System

  1. New Table `table_guests`
    - `id` (uuid, primary key) - Unique identifier
    - `event_id` (uuid, foreign key) - Reference to the event
    - `assigned_table_id` (uuid, foreign key) - Reference to floorplan_tables (required)
    - `guest_name` (text) - Name of the guest
    - `guest_email` (text) - Email address of the guest
    - `number_of_persons` (integer) - Number of people at the table
    - `table_note` (text) - Note/remark shown on the table assignment
    - `qr_code` (text) - QR code for scanning at entrance
    - `status` (text) - valid, used, cancelled
    - `scanned_at` (timestamptz) - When the guest checked in
    - `created_by_user_id` (uuid) - Admin who created this assignment
    - `created_by_email` (text) - Email of admin (denormalized for audit)
    - `email_sent` (boolean) - Whether confirmation email was sent
    - `email_sent_at` (timestamptz) - When email was sent
    - `created_at` (timestamptz) - Creation timestamp

  2. Security
    - Enable RLS
    - Admins/organizers can view and create
    - Scanners can update status

  3. Purpose
    - Allow table-only guest assignments without requiring a ticket type
    - Separate from regular guest tickets for simpler workflow
*/

-- Create table_guests table
CREATE TABLE IF NOT EXISTS table_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  assigned_table_id uuid NOT NULL REFERENCES floorplan_tables(id) ON DELETE CASCADE,
  guest_name text NOT NULL,
  guest_email text NOT NULL,
  number_of_persons integer NOT NULL DEFAULT 1,
  table_note text,
  qr_code text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'used', 'cancelled')),
  scanned_at timestamptz,
  created_by_user_id uuid NOT NULL,
  created_by_email text NOT NULL,
  email_sent boolean DEFAULT false,
  email_sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_table_guests_event_id ON table_guests(event_id);
CREATE INDEX IF NOT EXISTS idx_table_guests_assigned_table_id ON table_guests(assigned_table_id);
CREATE INDEX IF NOT EXISTS idx_table_guests_status ON table_guests(status);
CREATE INDEX IF NOT EXISTS idx_table_guests_qr_code ON table_guests(qr_code);

-- Enable RLS
ALTER TABLE table_guests ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Admins and organizers can view table guests for their events
CREATE POLICY "Admins and organizers can view table guests"
  ON table_guests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('superadmin', 'admin', 'organizer')
      AND (
        user_roles.role = 'superadmin'
        OR user_roles.event_id = table_guests.event_id
        OR user_roles.event_id IS NULL
      )
    )
  );

-- Admins and organizers can create table guests
CREATE POLICY "Admins and organizers can create table guests"
  ON table_guests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('superadmin', 'admin', 'organizer')
      AND (
        user_roles.role = 'superadmin'
        OR user_roles.event_id = table_guests.event_id
        OR user_roles.event_id IS NULL
      )
    )
    AND created_by_user_id = auth.uid()
  );

-- Scanners can update table guest status (for check-in)
CREATE POLICY "Scanners can update table guest status"
  ON table_guests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('superadmin', 'scanner')
      AND (
        user_roles.role = 'superadmin'
        OR user_roles.event_id = table_guests.event_id
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('superadmin', 'scanner')
      AND (
        user_roles.role = 'superadmin'
        OR user_roles.event_id = table_guests.event_id
      )
    )
  );

-- Comment for documentation
COMMENT ON TABLE table_guests IS 'Table-only guest assignments without tickets - for VIP table reservations, complimentary tables, etc.';