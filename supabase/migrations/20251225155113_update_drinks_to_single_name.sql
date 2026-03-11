/*
  # Update Drinks to Single Name Field

  ## Changes
  This migration updates the drinks table to use a single `name` field instead of separate `name_nl` and `name_tr` fields.
  
  ## Rationale
  - Drink names should be identical across all languages for consistency
  - Simplifies bar operations, CSV import/export, stock tracking, and reporting
  - Prevents confusion and mismatches between language versions
  - Category names remain multilingual (name_nl/name_tr)
  
  ## Migration Steps
  1. Add new `name` column
  2. Migrate existing data from name_nl to name
  3. Drop old name_nl and name_tr columns
  4. Add NOT NULL constraint

  ## Impact
  - Existing drinks will use their Dutch name as the single name
  - UI components updated to display single name regardless of language
  - Category translations still work (name_nl/name_tr preserved)
*/

-- Step 1: Add new name column (nullable initially for safe migration)
ALTER TABLE drinks ADD COLUMN IF NOT EXISTS name TEXT;

-- Step 2: Migrate data from name_nl to name (use name_nl as the source)
UPDATE drinks SET name = name_nl WHERE name IS NULL;

-- Step 3: Make name NOT NULL
ALTER TABLE drinks ALTER COLUMN name SET NOT NULL;

-- Step 4: Drop old multilingual columns
ALTER TABLE drinks DROP COLUMN IF EXISTS name_nl;
ALTER TABLE drinks DROP COLUMN IF EXISTS name_tr;

-- Step 5: Update any indexes that might reference the old columns
-- (none in the original schema, but good to be explicit)

-- Note: drink_categories keeps name_nl and name_tr for translations
-- Note: All edge functions and components will be updated to use single name field
