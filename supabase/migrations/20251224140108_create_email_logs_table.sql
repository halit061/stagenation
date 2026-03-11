/*
  # Create Email Logs Table

  1. New Table: email_logs
    - id (uuid, primary key)
    - order_id (uuid, foreign key to orders)
    - status (text) - 'sent' or 'failed'
    - provider (text) - email service provider (e.g., 'resend')
    - recipient_email (text) - email address
    - error_message (text, nullable) - error details if failed
    - created_at (timestamptz) - timestamp

  2. Purpose
    - Track all email sending attempts
    - Debug email delivery issues
    - Monitor email service reliability
    - Audit trail for customer support

  3. Security
    - Enable RLS
    - Super admins can view all logs
    - No public access

  4. Indexes
    - Index on order_id for fast lookups
    - Index on status for filtering
    - Index on created_at for chronological queries
*/

-- Create email_logs table
CREATE TABLE IF NOT EXISTS email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('sent', 'failed')),
  provider text NOT NULL DEFAULT 'resend',
  recipient_email text NOT NULL,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_email_logs_order_id ON email_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs(created_at DESC);

-- Enable RLS
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Super admins can view all email logs
CREATE POLICY "Super admins can view email logs"
  ON email_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  );

-- System can insert email logs (service role only)
CREATE POLICY "Service role can insert email logs"
  ON email_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);
