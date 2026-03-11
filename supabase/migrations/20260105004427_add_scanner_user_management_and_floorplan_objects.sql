/*
  # Scanner User Management and Floorplan Objects Enhancement
  
  1. Changes
    - Expand floorplan_objects type constraint to include DANCEFLOOR and DECOR_TABLE
    - Add label column to floorplan_objects (rename 'name' to 'label' for consistency)
    - Ensure user_roles table has proper structure for scanner management
    - Add indexes for performance
    
  2. Security
    - Maintain existing RLS policies
    - Add policies for floorplan_objects if missing
*/

-- Update floorplan_objects to support DANCEFLOOR and DECOR_TABLE types
DO $$
BEGIN
  -- Drop the existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'floorplan_objects_type_check'
  ) THEN
    ALTER TABLE floorplan_objects DROP CONSTRAINT floorplan_objects_type_check;
  END IF;
  
  -- Add new constraint with all required types
  ALTER TABLE floorplan_objects 
    ADD CONSTRAINT floorplan_objects_type_check 
    CHECK (type = ANY (ARRAY['STAGE'::text, 'BAR'::text, 'DANCEFLOOR'::text, 'DECOR_TABLE'::text, 'DJ_BOOTH'::text, 'ENTRANCE'::text, 'EXIT'::text, 'RESTROOM'::text]));
END $$;

-- Add label column if it doesn't exist (alias for name)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'floorplan_objects' AND column_name = 'label'
  ) THEN
    ALTER TABLE floorplan_objects ADD COLUMN label text;
    -- Copy existing name values to label
    UPDATE floorplan_objects SET label = name WHERE label IS NULL;
  END IF;
END $$;

-- Ensure is_visible column exists for floorplan_objects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'floorplan_objects' AND column_name = 'is_visible'
  ) THEN
    ALTER TABLE floorplan_objects ADD COLUMN is_visible boolean DEFAULT true;
  END IF;
END $$;

-- Add index for event_id on floorplan_objects for faster queries
CREATE INDEX IF NOT EXISTS idx_floorplan_objects_event_id ON floorplan_objects(event_id);
CREATE INDEX IF NOT EXISTS idx_floorplan_objects_type ON floorplan_objects(type);

-- Add index for user_roles for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);
CREATE INDEX IF NOT EXISTS idx_user_roles_is_active ON user_roles(is_active);

-- Ensure RLS policies exist for floorplan_objects
DO $$
BEGIN
  -- Policy for public read access
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'floorplan_objects' AND policyname = 'Public can view active floorplan objects'
  ) THEN
    CREATE POLICY "Public can view active floorplan objects"
      ON floorplan_objects FOR SELECT
      USING (is_active = true);
  END IF;
  
  -- Policy for authenticated admin users to manage
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'floorplan_objects' AND policyname = 'Admins can manage floorplan objects'
  ) THEN
    CREATE POLICY "Admins can manage floorplan objects"
      ON floorplan_objects FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM user_roles 
          WHERE user_roles.user_id = auth.uid() 
          AND user_roles.role IN ('super_admin', 'admin')
          AND user_roles.is_active = true
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN floorplan_objects.type IS 'Type of floorplan object: STAGE, BAR, DANCEFLOOR, DECOR_TABLE, DJ_BOOTH, ENTRANCE, EXIT, RESTROOM';
COMMENT ON COLUMN floorplan_objects.label IS 'Display label for the object (e.g., "Main Stage", "VIP Bar", "Dance Floor")';
COMMENT ON COLUMN floorplan_objects.is_visible IS 'Whether the object is visible on the public floorplan';
