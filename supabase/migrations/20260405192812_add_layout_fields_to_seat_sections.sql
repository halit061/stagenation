/*
  # Add layout configuration fields to seat_sections

  1. Modified Tables
    - `seat_sections`
      - `start_row_label` (text, default 'A') - Starting label for rows (letter or number)
      - `numbering_direction` (text, default 'left-to-right') - Seat numbering direction
      - `row_spacing` (integer, default 35) - Pixel spacing between rows
      - `seat_spacing` (integer, default 25) - Pixel spacing between seats

  2. Notes
    - These columns store the layout configuration so sections can be re-edited
      without losing their original settings
    - Safe migration using IF NOT EXISTS checks
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'seat_sections' AND column_name = 'start_row_label'
  ) THEN
    ALTER TABLE seat_sections ADD COLUMN start_row_label text NOT NULL DEFAULT 'A';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'seat_sections' AND column_name = 'numbering_direction'
  ) THEN
    ALTER TABLE seat_sections ADD COLUMN numbering_direction text NOT NULL DEFAULT 'left-to-right';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'seat_sections' AND column_name = 'row_spacing'
  ) THEN
    ALTER TABLE seat_sections ADD COLUMN row_spacing integer NOT NULL DEFAULT 35;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'seat_sections' AND column_name = 'seat_spacing'
  ) THEN
    ALTER TABLE seat_sections ADD COLUMN seat_spacing integer NOT NULL DEFAULT 25;
  END IF;
END $$;