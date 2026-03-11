/*
  # Auto-create ticket records for multi-person guest tickets

  1. Problem
    - The send-guest-ticket function creates QR entries in guest_ticket_qrs
      for each person, but only creates ONE ticket record (for person 1).
    - Persons 2-9 had no ticket record, so scanning their QR failed.

  2. Solution
    - A trigger on guest_ticket_qrs that fires AFTER INSERT.
    - For person_index > 1, it copies the parent ticket (person 1)
      and creates a new ticket with the correct qr_data and ticket_number.
    - For person_index = 1, it does nothing (parent ticket already exists).

  3. Safety
    - Only creates if no ticket with that qr_data already exists.
    - Uses the parent ticket as template for all fields.
    - Does NOT modify any existing records.
*/

CREATE OR REPLACE FUNCTION create_ticket_for_guest_qr()
RETURNS TRIGGER AS $$
DECLARE
  parent_ticket RECORD;
  new_ticket_number TEXT;
BEGIN
  IF NEW.person_index <= 1 THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM tickets WHERE qr_data = NEW.qr_token) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO parent_ticket
  FROM tickets
  WHERE order_id = NEW.order_id
    AND ticket_number LIKE 'GUEST-%-1'
  LIMIT 1;

  IF parent_ticket IS NULL THEN
    RETURN NEW;
  END IF;

  new_ticket_number := regexp_replace(parent_ticket.ticket_number, '-1$', '')
                       || '-' || NEW.person_index;

  IF EXISTS (SELECT 1 FROM tickets WHERE ticket_number = new_ticket_number) THEN
    RETURN NEW;
  END IF;

  INSERT INTO tickets (
    order_id, event_id, ticket_type_id, ticket_number,
    token, qr_data, qr_code, status, holder_name, holder_email,
    product_type, assigned_table_id, table_note,
    terms_accepted, terms_accepted_at, terms_version, terms_language,
    metadata
  ) VALUES (
    parent_ticket.order_id,
    parent_ticket.event_id,
    parent_ticket.ticket_type_id,
    new_ticket_number,
    substring(NEW.qr_token from 1 for 32),
    NEW.qr_token,
    NEW.qr_token,
    parent_ticket.status,
    parent_ticket.holder_name,
    parent_ticket.holder_email,
    parent_ticket.product_type,
    parent_ticket.assigned_table_id,
    parent_ticket.table_note,
    parent_ticket.terms_accepted,
    parent_ticket.terms_accepted_at,
    parent_ticket.terms_version,
    parent_ticket.terms_language,
    jsonb_build_object('auto_created', true, 'person_index', NEW.person_index, 'parent_ticket_id', parent_ticket.id)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_create_ticket_for_guest_qr'
  ) THEN
    CREATE TRIGGER trg_create_ticket_for_guest_qr
      AFTER INSERT ON guest_ticket_qrs
      FOR EACH ROW
      EXECUTE FUNCTION create_ticket_for_guest_qr();
  END IF;
END $$;