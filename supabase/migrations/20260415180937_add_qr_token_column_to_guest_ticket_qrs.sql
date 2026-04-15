/*
  # Add qr_token column to guest_ticket_qrs

  1. Modified Tables
    - `guest_ticket_qrs`
      - Add `qr_token` (text) - stores the unique QR token used for scanning and PDF generation
      - This column is referenced by send-guest-ticket, resend-guest-ticket-emails, and unified-scan functions

  2. Backfill
    - Copies existing data from `token` column to `qr_token` for any rows that may have used token previously

  3. Indexes
    - Add unique index on `qr_token` for fast lookups during scanning
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'guest_ticket_qrs' AND column_name = 'qr_token'
  ) THEN
    ALTER TABLE guest_ticket_qrs ADD COLUMN qr_token text;
  END IF;
END $$;

UPDATE guest_ticket_qrs
SET qr_token = COALESCE(token, qr_code, qr_data)
WHERE qr_token IS NULL AND (token IS NOT NULL OR qr_code IS NOT NULL OR qr_data IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS idx_guest_ticket_qrs_qr_token
  ON guest_ticket_qrs (qr_token)
  WHERE qr_token IS NOT NULL;
