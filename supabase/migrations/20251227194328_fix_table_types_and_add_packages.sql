/*
  # Fix Table Types and Add Package Assignment

  ## 1. Changes to `floorplan_tables`

  ### New Column
  - `package_id` (uuid, optional) - References table_packages for assigned package

  ### Fixed Constraints
  - `table_type` - Ensure only 'SEATED' or 'STANDING' allowed (proper enum constraint)
  - Default table_type to 'STANDING' if null

  ## 2. Data Repair

  ### Fix Existing Data
  - Normalize any incorrect table_type values
  - Set proper defaults based on capacity/seats

  ## 3. Security (RLS)

  No changes to RLS policies - existing policies remain

  ## 4. Important Notes

  - Backward compatibility: Existing tables with capacity > 0 are SEATED
  - Package assignment controlled by Super Admin only (enforced in UI)
  - package_id is optional (null = no package assigned)
  - Foreign key with ON DELETE SET NULL (if package deleted, table keeps working)
*/

-- Add package_id column to floorplan_tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'floorplan_tables' AND column_name = 'package_id'
  ) THEN
    ALTER TABLE floorplan_tables
    ADD COLUMN package_id uuid REFERENCES table_packages(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index for package lookups
CREATE INDEX IF NOT EXISTS idx_floorplan_tables_package
  ON floorplan_tables(package_id)
  WHERE package_id IS NOT NULL;

-- Data repair: Ensure table_type values are correct
-- If table_type is null or invalid, infer from capacity
UPDATE floorplan_tables
SET table_type = CASE
  WHEN table_type NOT IN ('SEATED', 'STANDING') OR table_type IS NULL THEN
    CASE
      WHEN capacity >= 4 THEN 'SEATED'
      ELSE 'STANDING'
    END
  ELSE table_type
END
WHERE table_type NOT IN ('SEATED', 'STANDING') OR table_type IS NULL;

-- Add constraint to ensure only valid table_type values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'floorplan_tables_table_type_check'
  ) THEN
    ALTER TABLE floorplan_tables
    ADD CONSTRAINT floorplan_tables_table_type_check
    CHECK (table_type IN ('SEATED', 'STANDING'));
  END IF;
END $$;

-- Set default for future inserts
ALTER TABLE floorplan_tables
  ALTER COLUMN table_type SET DEFAULT 'STANDING';
