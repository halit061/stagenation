/*
  # Add Email Tracking to Orders Table

  1. New Fields
    - Add `email_sent` (boolean, default false) - Tracks if ticket email was sent
    - Add `email_sent_at` (timestamptz, nullable) - Timestamp when email was sent
    - Add `email_error` (text, nullable) - Stores any email sending errors

  2. Purpose
    - Prevent duplicate ticket emails
    - Track email delivery status
    - Enable retry functionality for failed emails
    - Provide admin visibility into email issues

  3. Security
    - No RLS changes needed
    - Fields are managed server-side only
*/

-- Add email tracking fields to orders table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'email_sent'
  ) THEN
    ALTER TABLE orders ADD COLUMN email_sent boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'email_sent_at'
  ) THEN
    ALTER TABLE orders ADD COLUMN email_sent_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'email_error'
  ) THEN
    ALTER TABLE orders ADD COLUMN email_error text;
  END IF;
END $$;

-- Create index for efficient querying of unsent emails
CREATE INDEX IF NOT EXISTS idx_orders_email_sent ON orders(email_sent, status) WHERE status = 'paid';

-- Update existing paid orders to have email_sent = false if not already set
UPDATE orders 
SET email_sent = false 
WHERE status = 'paid' 
AND email_sent IS NULL;
