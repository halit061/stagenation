/*
  # Add ticket number system and QR tokens for seat tickets

  1. New Columns
    - `ticket_seats.ticket_number` (varchar(20), unique) - Human-readable ticket number (SN-2026-XXXXXX)
    - `ticket_seats.qr_token` (varchar(24), unique) - URL-safe token for QR verification

  2. New Sequence
    - `ticket_number_seq` - Global sequence starting at 1000 for ticket numbering

  3. New Trigger
    - `trg_generate_seat_ticket_number` - Auto-generates ticket_number and qr_token on INSERT

  4. Security
    - No RLS changes needed (ticket_seats already has RLS)

  5. Notes
    - ticket_number format: SN-YYYY-XXXXXX (globally unique, never reused)
    - qr_token: 16 hex chars from gen_random_bytes(8), URL-safe
    - qr_data auto-populated with verification URL
*/

CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 1000;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_seats' AND column_name = 'ticket_number'
  ) THEN
    ALTER TABLE ticket_seats ADD COLUMN ticket_number VARCHAR(20) UNIQUE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_seats' AND column_name = 'qr_token'
  ) THEN
    ALTER TABLE ticket_seats ADD COLUMN qr_token VARCHAR(24) UNIQUE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION generate_seat_ticket_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.ticket_number IS NULL THEN
    NEW.ticket_number := 'SN-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' ||
                         LPAD(nextval('ticket_number_seq')::TEXT, 6, '0');
  END IF;
  IF NEW.qr_token IS NULL THEN
    NEW.qr_token := encode(gen_random_bytes(8), 'hex');
  END IF;
  IF NEW.ticket_code IS NULL THEN
    NEW.ticket_code := NEW.ticket_number;
  END IF;
  IF NEW.qr_data IS NULL THEN
    NEW.qr_data := 'https://stagenation.be/verify/' || NEW.qr_token;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_seat_ticket_number ON ticket_seats;
CREATE TRIGGER trg_generate_seat_ticket_number
BEFORE INSERT ON ticket_seats
FOR EACH ROW EXECUTE FUNCTION generate_seat_ticket_number();
