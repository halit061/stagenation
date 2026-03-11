/*
  # Fix table_guests ticket FK constraint for cascade delete

  1. Problem
    - table_guests.ticket_id references tickets(id) WITHOUT cascade
    - Deleting guest tickets fails with FK violation

  2. Fix
    - Drop existing constraint
    - Recreate with ON DELETE CASCADE
*/

ALTER TABLE table_guests
DROP CONSTRAINT IF EXISTS table_guests_ticket_id_fkey;

ALTER TABLE table_guests
ADD CONSTRAINT table_guests_ticket_id_fkey
FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;