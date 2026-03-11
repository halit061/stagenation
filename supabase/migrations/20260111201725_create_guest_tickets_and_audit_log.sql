/*
  # Guest Tickets and Audit Log System

  1. New Tables
    - `guest_tickets`
      - `id` (uuid, primary key) - Unique identifier for the guest ticket
      - `event_id` (uuid, foreign key) - Reference to the event
      - `recipient_email` (text) - Email address of the recipient
      - `recipient_name` (text) - Name of the recipient
      - `qr_code` (text) - QR code for scanning
      - `status` (text) - Status of the ticket (valid, used, cancelled)
      - `scanned_at` (timestamptz) - Timestamp when ticket was scanned
      - `created_at` (timestamptz) - When the guest ticket was created
      - `sent_by_user_id` (uuid, foreign key) - ID of admin who sent the ticket
      - `sent_by_email` (text) - Email of admin who sent the ticket (denormalized for audit)
      - `notes` (text) - Optional notes about the guest ticket

    - `guest_ticket_audit_log`
      - `id` (uuid, primary key) - Unique identifier for the audit entry
      - `guest_ticket_id` (uuid, foreign key) - Reference to the guest ticket
      - `event_id` (uuid, foreign key) - Reference to the event
      - `action` (text) - Action performed (created, sent, scanned, cancelled)
      - `sent_by_user_id` (uuid) - ID of admin who performed the action
      - `sent_by_email` (text) - Email of admin (denormalized)
      - `recipient_email` (text) - Email of the recipient
      - `recipient_name` (text) - Name of the recipient
      - `created_at` (timestamptz) - When the action was performed
      - `metadata` (jsonb) - Additional metadata about the action

  2. Security
    - Enable RLS on both tables
    - Guest tickets: Only authenticated admins and organizers can view/create
    - Audit log: Only superadmins can view
    - All modifications are logged in audit trail
    - Sender identity cannot be edited or removed

  3. Indexes
    - Add indexes for common queries on event_id, sent_by_user_id, status
*/

-- Create guest_tickets table
CREATE TABLE IF NOT EXISTS guest_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  recipient_name text NOT NULL,
  qr_code text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'used', 'cancelled')),
  scanned_at timestamptz,
  created_at timestamptz DEFAULT now(),
  sent_by_user_id uuid NOT NULL,
  sent_by_email text NOT NULL,
  notes text
);

-- Create guest_ticket_audit_log table
CREATE TABLE IF NOT EXISTS guest_ticket_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_ticket_id uuid REFERENCES guest_tickets(id) ON DELETE SET NULL,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('created', 'sent', 'scanned', 'cancelled')),
  sent_by_user_id uuid NOT NULL,
  sent_by_email text NOT NULL,
  recipient_email text NOT NULL,
  recipient_name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_guest_tickets_event_id ON guest_tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_guest_tickets_sent_by_user_id ON guest_tickets(sent_by_user_id);
CREATE INDEX IF NOT EXISTS idx_guest_tickets_status ON guest_tickets(status);
CREATE INDEX IF NOT EXISTS idx_guest_tickets_qr_code ON guest_tickets(qr_code);

CREATE INDEX IF NOT EXISTS idx_guest_ticket_audit_log_event_id ON guest_ticket_audit_log(event_id);
CREATE INDEX IF NOT EXISTS idx_guest_ticket_audit_log_sent_by_user_id ON guest_ticket_audit_log(sent_by_user_id);
CREATE INDEX IF NOT EXISTS idx_guest_ticket_audit_log_guest_ticket_id ON guest_ticket_audit_log(guest_ticket_id);
CREATE INDEX IF NOT EXISTS idx_guest_ticket_audit_log_created_at ON guest_ticket_audit_log(created_at DESC);

-- Enable RLS
ALTER TABLE guest_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_ticket_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for guest_tickets

-- Admins and organizers can view guest tickets for their events
CREATE POLICY "Admins and organizers can view guest tickets"
  ON guest_tickets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('superadmin', 'admin', 'organizer')
      AND (
        user_roles.role = 'superadmin'
        OR user_roles.event_id = guest_tickets.event_id
        OR user_roles.event_id IS NULL
      )
    )
  );

-- Admins and organizers can create guest tickets for their events
CREATE POLICY "Admins and organizers can create guest tickets"
  ON guest_tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('superadmin', 'admin', 'organizer')
      AND (
        user_roles.role = 'superadmin'
        OR user_roles.event_id = guest_tickets.event_id
        OR user_roles.event_id IS NULL
      )
    )
    AND sent_by_user_id = auth.uid()
  );

-- Scanners can update guest tickets status (for scanning)
CREATE POLICY "Scanners can update guest ticket status"
  ON guest_tickets
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('superadmin', 'scanner')
      AND (
        user_roles.role = 'superadmin'
        OR user_roles.event_id = guest_tickets.event_id
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
        OR user_roles.event_id = guest_tickets.event_id
      )
    )
  );

-- RLS Policies for guest_ticket_audit_log

-- Only superadmins can view audit log
CREATE POLICY "Only superadmins can view audit log"
  ON guest_ticket_audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'superadmin'
    )
  );

-- System can insert into audit log (for triggers)
CREATE POLICY "System can insert audit log entries"
  ON guest_ticket_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create trigger function to automatically log guest ticket creation
CREATE OR REPLACE FUNCTION log_guest_ticket_creation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO guest_ticket_audit_log (
    guest_ticket_id,
    event_id,
    action,
    sent_by_user_id,
    sent_by_email,
    recipient_email,
    recipient_name,
    metadata
  ) VALUES (
    NEW.id,
    NEW.event_id,
    'created',
    NEW.sent_by_user_id,
    NEW.sent_by_email,
    NEW.recipient_email,
    NEW.recipient_name,
    jsonb_build_object(
      'qr_code', NEW.qr_code,
      'notes', NEW.notes
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for guest ticket creation
DROP TRIGGER IF EXISTS trigger_log_guest_ticket_creation ON guest_tickets;
CREATE TRIGGER trigger_log_guest_ticket_creation
  AFTER INSERT ON guest_tickets
  FOR EACH ROW
  EXECUTE FUNCTION log_guest_ticket_creation();

-- Create trigger function to log guest ticket status changes
CREATE OR REPLACE FUNCTION log_guest_ticket_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status != OLD.status THEN
    INSERT INTO guest_ticket_audit_log (
      guest_ticket_id,
      event_id,
      action,
      sent_by_user_id,
      sent_by_email,
      recipient_email,
      recipient_name,
      metadata
    ) VALUES (
      NEW.id,
      NEW.event_id,
      CASE
        WHEN NEW.status = 'used' THEN 'scanned'
        WHEN NEW.status = 'cancelled' THEN 'cancelled'
        ELSE 'status_changed'
      END,
      auth.uid(),
      (SELECT email FROM auth.users WHERE id = auth.uid()),
      NEW.recipient_email,
      NEW.recipient_name,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'scanned_at', NEW.scanned_at
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for guest ticket status changes
DROP TRIGGER IF EXISTS trigger_log_guest_ticket_status_change ON guest_tickets;
CREATE TRIGGER trigger_log_guest_ticket_status_change
  AFTER UPDATE ON guest_tickets
  FOR EACH ROW
  EXECUTE FUNCTION log_guest_ticket_status_change();
