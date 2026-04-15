/*
  # Restore Complete Brand System for Multi-Brand Platform

  ## Overview
  Restores the full brands system that was previously removed.
  This allows multiple brands (StageNation, etc.) to operate on the same platform.

  ## Changes Made

  ### 1. Brands Table
  - Create brands table with id, name, slug
  - Add indexes for performance
  - Enable RLS with proper policies
  - Insert default StageNation brand

  ### 2. Events Table Enhancement
  - Add brand column (text) to link events to brands
  - Default to 'stagenation' for existing events
  - Create index for fast brand-based queries

  ### 3. Security (RLS)
  - All authenticated users can read brands
  - Only super_admins can create/update/delete brands

  ## Brand System Design
  - Each event belongs to one brand via the brand column
  - Brand slug is used for URL routing and identification
  - Brands can have multiple events
  - Future: Brand-specific styling, emails, domains
*/

-- ============================================================================
-- 1. CREATE BRANDS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index on slug for fast lookups
CREATE INDEX IF NOT EXISTS idx_brands_slug ON brands(slug);

-- Enable RLS
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;

-- RLS Policies: All authenticated users can read brands
DROP POLICY IF EXISTS "Authenticated users can read all brands" ON brands;
CREATE POLICY "Authenticated users can read all brands"
  ON brands
  FOR SELECT
  TO authenticated
  USING (true);

-- Only super_admins can insert brands
DROP POLICY IF EXISTS "Super admins can insert brands" ON brands;
CREATE POLICY "Super admins can insert brands"
  ON brands
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  );

-- Only super_admins can update brands
DROP POLICY IF EXISTS "Super admins can update brands" ON brands;
CREATE POLICY "Super admins can update brands"
  ON brands
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  );

-- Only super_admins can delete brands
DROP POLICY IF EXISTS "Super admins can delete brands" ON brands;
CREATE POLICY "Super admins can delete brands"
  ON brands
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  );

-- ============================================================================
-- 2. INSERT DEFAULT STAGENATION BRAND
-- ============================================================================

INSERT INTO brands (name, slug) 
VALUES ('StageNation', 'stagenation')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 3. ADD BRAND COLUMN TO EVENTS
-- ============================================================================

-- Add brand column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'brand'
  ) THEN
    ALTER TABLE events ADD COLUMN brand text DEFAULT 'stagenation';
    CREATE INDEX idx_events_brand ON events(brand);
  END IF;
END $$;

-- Update existing events to have 'stagenation' as brand if they don't have one
UPDATE events 
SET brand = 'stagenation'
WHERE brand IS NULL OR brand = '';

-- Make brand column NOT NULL with default
ALTER TABLE events 
ALTER COLUMN brand SET DEFAULT 'stagenation';

DO $$
BEGIN
  BEGIN
    ALTER TABLE events 
    ALTER COLUMN brand SET NOT NULL;
  EXCEPTION
    WHEN others THEN
      -- If this fails, update nulls first
      UPDATE events SET brand = 'stagenation' WHERE brand IS NULL;
      ALTER TABLE events ALTER COLUMN brand SET NOT NULL;
  END;
END $$;

-- ============================================================================
-- 4. GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON brands TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON brands TO authenticated;
