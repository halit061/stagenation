/*
  # Backfill missing ticket records for multi-person guest tickets

  1. Problem
    - When guest tickets are sent for multiple persons (persons_count > 1),
      only 1 ticket record is created in the `tickets` table (for person 1).
    - Persons 2-9 have QR tokens in `guest_ticket_qrs` but no corresponding
      ticket record, so scanning their QR codes fails with "invalid ticket".

  2. Fix
    - For each guest_ticket_qrs entry where person_index > 1, create a
      corresponding ticket record in the `tickets` table.
    - The new ticket's qr_data and qr_code are set to the guest_ticket_qrs.qr_token.
    - The token (short form) is the first 32 chars of qr_token.
    - The ticket_number follows the pattern: base-N (replacing -1 suffix with -N).

  3. Safety
    - Only inserts where no ticket record exists for that qr_data.
    - Uses the parent ticket (person 1) as the template for all fields.
    - Does NOT modify any existing records.
*/

INSERT INTO tickets (
  order_id, event_id, ticket_type_id, ticket_number,
  token, qr_data, qr_code, status, holder_name, holder_email,
  product_type, assigned_table_id, table_note,
  terms_accepted, terms_accepted_at, terms_version, terms_language,
  metadata
)
SELECT
  parent.order_id,
  parent.event_id,
  parent.ticket_type_id,
  regexp_replace(parent.ticket_number, '-1$', '') || '-' || gq.person_index,
  substring(gq.qr_token from 1 for 32),
  gq.qr_token,
  gq.qr_token,
  parent.status,
  parent.holder_name,
  parent.holder_email,
  parent.product_type,
  parent.assigned_table_id,
  parent.table_note,
  parent.terms_accepted,
  parent.terms_accepted_at,
  parent.terms_version,
  parent.terms_language,
  jsonb_build_object('backfilled', true, 'person_index', gq.person_index, 'parent_ticket_id', parent.id)
FROM guest_ticket_qrs gq
JOIN orders o ON o.id = gq.order_id
JOIN tickets parent ON parent.order_id = gq.order_id
  AND parent.ticket_number LIKE 'GUEST-%-1'
WHERE gq.person_index > 1
  AND NOT EXISTS (
    SELECT 1 FROM tickets t2
    WHERE t2.qr_data = gq.qr_token
  );