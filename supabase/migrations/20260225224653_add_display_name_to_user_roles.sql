/*
  # Add display_name to user_roles

  1. Modified Tables
    - `user_roles`
      - Added `display_name` (text, nullable) - A friendly name to identify the user in the admin panel

  2. Notes
    - This column is optional and used for display purposes only
    - Existing rows will have NULL display_name
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_roles' AND column_name = 'display_name'
  ) THEN
    ALTER TABLE user_roles ADD COLUMN display_name text DEFAULT NULL;
  END IF;
END $$;