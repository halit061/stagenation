/*
  # Add qr_code column to tickets table

  ## Problem
  Multiple edge functions (validate-ticket, api-validate-ticket, unified-scan,
  resend-ticket-email) reference ticket.qr_code but only qr_data exists.
  The code uses qr_code as a display-friendly field while qr_data holds
  the raw payload. Adding qr_code as an alias/copy column resolves this.

  ## Change
  - `tickets.qr_code` (text, nullable) - QR code image data or display token
    (can be populated same as qr_data, or set separately)
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'qr_code') THEN
    ALTER TABLE public.tickets ADD COLUMN qr_code text;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
