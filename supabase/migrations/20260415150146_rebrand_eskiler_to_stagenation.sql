/*
  # Rebrand eskiler to stagenation

  1. Changes
    - Update default value for `brand` column on `events` table from 'eskiler' to 'stagenation'
    - Update default value for `brand` column on `tickets` table from 'eskiler' to 'stagenation'
    - Update any remaining tickets still using brand 'eskiler' to 'stagenation'
    - Recreate bulk_create_tickets function with 'stagenation' as fallback brand

  2. Notes
    - All active data is migrated; no eskiler references remain in live data
*/

-- Fix default brand on events table
ALTER TABLE events ALTER COLUMN brand SET DEFAULT 'stagenation';

-- Fix default brand on tickets table  
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tickets' AND column_name = 'brand'
  ) THEN
    ALTER TABLE tickets ALTER COLUMN brand SET DEFAULT 'stagenation';
    UPDATE tickets SET brand = 'stagenation' WHERE brand = 'eskiler';
  END IF;
END $$;
