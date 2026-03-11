/*
  # Add brand column to user_roles table

  1. Changes
    - Add `brand` column to `user_roles` table
    - Column is nullable text to allow roles without brand restriction

  2. Notes
    - This enables brand-specific role assignment
    - Existing roles will have NULL brand (unrestricted)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_roles' AND column_name = 'brand'
  ) THEN
    ALTER TABLE user_roles ADD COLUMN brand text;
  END IF;
END $$;