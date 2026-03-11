/*
  # Add Table Assignment to Guest Tickets

  1. New Columns on `tickets` table
    - `assigned_table_id` (uuid, nullable) - Reference to floorplan_tables for guest ticket table assignment
    - `table_note` (text, nullable) - Free-text note/remark shown on the ticket (e.g., "Tafel zonder drank", "VIP")

  2. Changes
    - Adds foreign key from tickets.assigned_table_id to floorplan_tables.id
    - Adds index for faster lookups by assigned_table_id
    - No uniqueness constraint (same table can be assigned to multiple guest tickets)

  3. Purpose
    - Allow SuperAdmin to assign a table from the floorplan to a guest ticket
    - Display table assignment and note on the ticket view/QR payload
    - Maintain scanner compatibility (no breaking changes)
*/

-- Add assigned_table_id column to tickets table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tickets' AND column_name = 'assigned_table_id'
  ) THEN
    ALTER TABLE tickets ADD COLUMN assigned_table_id uuid REFERENCES floorplan_tables(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add table_note column to tickets table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tickets' AND column_name = 'table_note'
  ) THEN
    ALTER TABLE tickets ADD COLUMN table_note text;
  END IF;
END $$;

-- Add index for faster lookups by assigned_table_id
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_table_id 
  ON tickets(assigned_table_id) 
  WHERE assigned_table_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN tickets.assigned_table_id IS 'Optional table assignment for guest tickets - references floorplan_tables';
COMMENT ON COLUMN tickets.table_note IS 'Optional note/remark shown on ticket (e.g., VIP, Tafel zonder drank)';