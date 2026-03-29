/*
  # Fix ticket_type_sections foreign key to ticket_types

  1. Problem
    - The `ticket_type_sections` table is missing a FK to `ticket_types`
    - This breaks PostgREST joins like `ticket_types!inner(event_id)`
    - Causes "Fout bij laden ticket types" error in the Floorplan Editor

  2. Changes
    - Add missing FK from `ticket_type_sections.ticket_type_id` to `ticket_types.id`
    - Add index on `ticket_type_id` for query performance

  3. Notes
    - The FK to `seat_sections` already exists
    - CASCADE delete ensures cleanup when a ticket type is removed
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'ticket_type_sections'::regclass 
    AND confrelid = 'ticket_types'::regclass
    AND contype = 'f'
  ) THEN
    ALTER TABLE ticket_type_sections
      ADD CONSTRAINT ticket_type_sections_ticket_type_id_fkey
      FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ticket_type_sections_ticket_type_id
  ON ticket_type_sections(ticket_type_id);
