/*
  # Create Brands Table

  1. New Tables
    - `brands`
      - `id` (uuid, primary key)
      - `name` (text, required) - Display name of the brand
      - `slug` (text, unique, required) - URL-friendly identifier
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp

  2. Indexes
    - Index on `slug` for fast lookups

  3. Security
    - Enable RLS on `brands` table
    - Allow authenticated users to read all brands
    - Only super_admins can create/update/delete brands

  4. Changes
    - Update `events` table to make `brand` NOT NULL with default 'eskiler'
    - Existing events without brand get 'eskiler' as default
*/

-- Create brands table
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
CREATE POLICY "Authenticated users can read all brands"
  ON brands
  FOR SELECT
  TO authenticated
  USING (true);

-- Only super_admins can insert brands
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

-- Insert default brand 'eskiler'
INSERT INTO brands (name, slug) 
VALUES ('Eskiler', 'eskiler')
ON CONFLICT (slug) DO NOTHING;

-- Update existing events to have 'eskiler' as brand if they don't have one
UPDATE events 
SET brand = 'eskiler'
WHERE brand IS NULL OR brand = '';

-- Make brand column NOT NULL with default
ALTER TABLE events 
ALTER COLUMN brand SET DEFAULT 'eskiler',
ALTER COLUMN brand SET NOT NULL;