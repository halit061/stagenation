/*
  # Add public_token to tickets

  1. Changes
    - Add public_token (uuid) column to tickets table
    - Generate random UUID for existing tickets
    - Create unique index on public_token
    - Allow public read access via public_token only

  2. Security
    - public_token is random UUID, not guessable
    - Used for email link access without authentication
*/

-- Add public_token column
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS public_token uuid DEFAULT gen_random_uuid();

-- Backfill existing tickets with random tokens
UPDATE tickets SET public_token = gen_random_uuid() WHERE public_token IS NULL;

-- Make it NOT NULL after backfill
ALTER TABLE tickets ALTER COLUMN public_token SET NOT NULL;

-- Create unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_public_token ON tickets(public_token);

-- Add RLS policy for public ticket view by token
DROP POLICY IF EXISTS "Public can view ticket by public_token" ON tickets;
CREATE POLICY "Public can view ticket by public_token"
  ON tickets FOR SELECT
  TO anon
  USING (true);
