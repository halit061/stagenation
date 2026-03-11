/*
  # Add Terms & Conditions Acceptance Tracking

  Run this SQL in your Supabase SQL Editor to add T&C acceptance tracking

  1. Schema Changes
    - Add terms acceptance fields to `tickets` table:
      - `terms_accepted` (boolean, default false) - Whether T&C were accepted
      - `terms_accepted_at` (timestamptz, nullable) - When T&C were accepted
      - `terms_version` (text, nullable) - Version/date of T&C accepted (e.g., "2024-12-15")
      - `terms_language` (text, nullable) - Language of T&C accepted (nl/en/tr)

  2. Purpose
    - Legal compliance: Store proof of T&C acceptance
    - Audit trail: Track when and which version was accepted
    - Multi-language support: Know which language version was accepted
*/

-- Add terms acceptance tracking fields to tickets table
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS terms_accepted boolean DEFAULT false;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS terms_version text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS terms_language text;

-- Create index for querying tickets by terms acceptance
CREATE INDEX IF NOT EXISTS idx_tickets_terms_accepted ON tickets(terms_accepted);

-- Verify the migration completed successfully
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'tickets'
AND column_name IN ('terms_accepted', 'terms_accepted_at', 'terms_version', 'terms_language')
ORDER BY column_name;
