/*
  # Add provider_message_id to email_logs

  1. Changes
    - Add `provider_message_id` column to `email_logs` table
    - This stores the message ID returned by email providers (e.g., Resend)
    - Used for tracking and debugging email delivery
    - Nullable because old records won't have this value

  2. Notes
    - Existing records will have NULL for provider_message_id
    - New email sends will populate this field
*/

-- Add provider_message_id column to email_logs
ALTER TABLE email_logs
ADD COLUMN IF NOT EXISTS provider_message_id TEXT;

-- Add index for faster lookups by provider message ID
CREATE INDEX IF NOT EXISTS idx_email_logs_provider_message_id
  ON email_logs(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN email_logs.provider_message_id IS 'Message ID from email provider (e.g., Resend message ID for tracking)';
