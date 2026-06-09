-- Increase the persons_count limit from 9 to 50 for guest tickets
-- The backend edge function already supports up to 50

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_persons_count_check;
ALTER TABLE orders ADD CONSTRAINT orders_persons_count_check 
  CHECK (persons_count >= 1 AND persons_count <= 50);

ALTER TABLE guest_ticket_qrs DROP CONSTRAINT IF EXISTS guest_ticket_qrs_person_index_check;
ALTER TABLE guest_ticket_qrs ADD CONSTRAINT guest_ticket_qrs_person_index_check 
  CHECK (person_index >= 1 AND person_index <= 50);
