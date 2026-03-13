/*
  # Add missing columns to user_roles table

  1. Modified Tables
    - `user_roles`
      - Add `is_active` (boolean, default true) - required by all auth checks in frontend and edge functions
      - Add `display_name` (text, nullable) - used in SuperAdmin role management UI

  2. Important Notes
    - All existing rows get is_active = true by default
    - This does not change any existing data or constraints
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_roles' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.user_roles ADD COLUMN is_active boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_roles' AND column_name = 'display_name'
  ) THEN
    ALTER TABLE public.user_roles ADD COLUMN display_name text;
  END IF;
END $$;

UPDATE public.user_roles SET is_active = true WHERE is_active IS NULL;