/*
  # Add Orientation to Seat Sections

  ## Overview
  Adds a seat orientation field to seat_sections that controls how seats 
  face within a tribune (towards the stage). This allows tribunes on all 
  four sides of a venue to have their seats correctly oriented.

  ## Changes
  1. New column `orientation` on `seat_sections`
     - Type: text with CHECK constraint
     - Values: 'top', 'bottom', 'left', 'right'
     - Default: 'top' (seats face upward, stage is above)
     - Backwards compatible: all existing sections default to 'top'

  ## Notes
  - The existing `rotation` column (numeric, degrees) is used for free rotation
  - `orientation` controls seat generation layout (row/column direction)
  - `rotation` controls visual rotation of the entire section group
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'seat_sections' AND column_name = 'orientation'
  ) THEN
    ALTER TABLE public.seat_sections
      ADD COLUMN orientation text NOT NULL DEFAULT 'top'
      CHECK (orientation IN ('top', 'bottom', 'left', 'right'));
  END IF;
END $$;
