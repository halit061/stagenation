/*
  # Add row label direction to seat_sections

  1. Modified Tables
    - `seat_sections`
      - `row_label_direction` (text, default 'top-to-bottom') - Controls whether row A starts at top or bottom of section

  2. Notes
    - Allows admins to reverse the row labeling order
    - Default 'top-to-bottom' preserves existing behavior
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'seat_sections' AND column_name = 'row_label_direction'
  ) THEN
    ALTER TABLE seat_sections ADD COLUMN row_label_direction text NOT NULL DEFAULT 'top-to-bottom';
  END IF;
END $$;