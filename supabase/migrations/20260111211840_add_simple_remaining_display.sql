/*
  # Add Simple Remaining Tickets Display

  1. New Columns (ticket_types table)
    - `show_remaining_tickets` (boolean): Enable/disable display
    - `remaining_display_threshold` (integer): Show only when remaining <= threshold

  2. Display Logic
    - SuperAdmin controls these 2 fields only
    - Public page shows "Nog {remaining} beschikbaar" when enabled
*/

-- Add show_remaining_tickets column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_types' AND column_name = 'show_remaining_tickets'
  ) THEN
    ALTER TABLE ticket_types ADD COLUMN show_remaining_tickets BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- Add remaining_display_threshold column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_types' AND column_name = 'remaining_display_threshold'
  ) THEN
    ALTER TABLE ticket_types ADD COLUMN remaining_display_threshold INTEGER NULL;
  END IF;
END $$;

-- Add constraint for threshold (must be positive if set)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'ticket_types_remaining_threshold_positive'
  ) THEN
    ALTER TABLE ticket_types ADD CONSTRAINT ticket_types_remaining_threshold_positive
      CHECK (remaining_display_threshold IS NULL OR remaining_display_threshold > 0);
  END IF;
END $$;