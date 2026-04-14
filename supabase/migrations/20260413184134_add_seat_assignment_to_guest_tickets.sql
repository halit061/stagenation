/*
  # Add seat assignment support to guest tickets

  1. Modified Tables
    - `guest_ticket_qrs`
      - `seat_id` (uuid, nullable) - references the assigned seat
      - `section_name` (text, nullable) - denormalized section name for display
      - `row_label` (text, nullable) - denormalized row label
      - `seat_number` (integer, nullable) - denormalized seat number

  2. Notes
    - All seat fields are optional (guest tickets can still be issued without seats)
    - Seat info is denormalized for fast display without joins
    - seat_id references seats table for integrity
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'guest_ticket_qrs' AND column_name = 'seat_id'
  ) THEN
    ALTER TABLE guest_ticket_qrs ADD COLUMN seat_id uuid REFERENCES seats(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'guest_ticket_qrs' AND column_name = 'section_name'
  ) THEN
    ALTER TABLE guest_ticket_qrs ADD COLUMN section_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'guest_ticket_qrs' AND column_name = 'row_label'
  ) THEN
    ALTER TABLE guest_ticket_qrs ADD COLUMN row_label text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'guest_ticket_qrs' AND column_name = 'seat_number'
  ) THEN
    ALTER TABLE guest_ticket_qrs ADD COLUMN seat_number integer;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_guest_ticket_qrs_seat_id ON guest_ticket_qrs(seat_id) WHERE seat_id IS NOT NULL;