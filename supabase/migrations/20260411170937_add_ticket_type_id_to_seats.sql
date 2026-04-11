/*
  # Add ticket_type_id to seats

  1. Modified Tables
    - `seats`
      - Added `ticket_type_id` (uuid, nullable, FK to ticket_types.id, ON DELETE SET NULL)
  2. Notes
    - Links each seat to a ticket type for pricing and color
    - SET NULL on delete so seats are not lost if a ticket type is removed
*/

ALTER TABLE seats ADD COLUMN IF NOT EXISTS ticket_type_id UUID REFERENCES ticket_types(id) ON DELETE SET NULL;
