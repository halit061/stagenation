/*
  # Add venue_name column to events

  1. Modified Tables
    - `events`
      - Added `venue_name` (text, nullable) - The name of the venue where the event takes place

  2. Data Update
    - Sets venue_name to 'The Max' for the existing StageNation event
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'venue_name'
  ) THEN
    ALTER TABLE events ADD COLUMN venue_name text;
  END IF;
END $$;

UPDATE events SET venue_name = 'The Max' WHERE venue_name IS NULL;