/*
  # Create Table Packages and Visual Standing Tables

  ## 1. New Tables

  ### `table_packages`
  Super Admin–managed reusable table reservation packages that define what's included
  in a table reservation (people, items, pricing).

  - `id` (uuid, primary key)
  - `name` (text, required) - Package display name
  - `description` (text, optional) - Full package description
  - `included_people` (integer, optional) - Number of people included
  - `included_items` (jsonb, optional) - Array of items with label and quantity
    Example: [{"label": "Bottle of spirits", "qty": 3}, {"label": "Cold snacks", "qty": 1}]
  - `base_price` (numeric, optional) - Base price in cents
  - `currency` (text, default 'EUR') - Currency code
  - `is_active` (boolean, default true) - Soft delete flag
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `visual_standing_tables`
  Visual-only floor plan objects for layout clarity. Not reservable, no tickets, no price.

  - `id` (uuid, primary key)
  - `event_id` (uuid, references events) - Which event floor plan this belongs to
  - `position_x` (numeric, required) - X coordinate
  - `position_y` (numeric, required) - Y coordinate
  - `radius` (numeric, default 30) - Visual size
  - `label` (text, optional) - Display label
  - `is_visible` (boolean, default true) - Show/hide toggle
  - `created_at` (timestamptz)

  ## 2. Security (RLS)

  ### `table_packages`
  - Super Admin: Full CRUD access
  - All others: Read-only access to active packages

  ### `visual_standing_tables`
  - Super Admin: Full CRUD access
  - All others: Read-only access

  ## 3. Important Notes

  - Table packages are INDEPENDENT from floor plan geometry
  - Visual standing tables are PURELY decorative (no reservations, no tickets, no price)
  - Existing floor plan logic is NOT modified
  - Changes to packages propagate immediately to all events using them
  - Organizers can only SELECT packages, never modify them
*/

-- Create table_packages table
CREATE TABLE IF NOT EXISTS table_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  included_people integer,
  included_items jsonb DEFAULT '[]'::jsonb,
  base_price numeric(10, 2) DEFAULT 0,
  currency text DEFAULT 'EUR',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for active packages lookup
CREATE INDEX IF NOT EXISTS idx_table_packages_active
  ON table_packages(is_active)
  WHERE is_active = true;

-- Create visual_standing_tables table
CREATE TABLE IF NOT EXISTS visual_standing_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  position_x numeric(10, 2) NOT NULL,
  position_y numeric(10, 2) NOT NULL,
  radius numeric(10, 2) DEFAULT 30,
  label text,
  is_visible boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create index for event lookups
CREATE INDEX IF NOT EXISTS idx_visual_standing_tables_event
  ON visual_standing_tables(event_id);

-- Enable RLS
ALTER TABLE table_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE visual_standing_tables ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES: table_packages
-- ============================================================================

-- Super Admin can view all packages
CREATE POLICY "Super admins can view all packages"
  ON table_packages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  );

-- All authenticated users can view active packages (read-only for organizers)
CREATE POLICY "Users can view active packages"
  ON table_packages
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Super Admin can insert packages
CREATE POLICY "Super admins can insert packages"
  ON table_packages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  );

-- Super Admin can update packages
CREATE POLICY "Super admins can update packages"
  ON table_packages
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

-- Super Admin can delete packages (soft delete preferred via is_active=false)
CREATE POLICY "Super admins can delete packages"
  ON table_packages
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
-- RLS POLICIES: visual_standing_tables
-- ============================================================================

-- All authenticated users can view visual standing tables
CREATE POLICY "Users can view visual standing tables"
  ON visual_standing_tables
  FOR SELECT
  TO authenticated
  USING (true);

-- Super Admin can insert visual standing tables
CREATE POLICY "Super admins can insert visual tables"
  ON visual_standing_tables
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'super_admin'
    )
  );

-- Super Admin can update visual standing tables
CREATE POLICY "Super admins can update visual tables"
  ON visual_standing_tables
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

-- Super Admin can delete visual standing tables
CREATE POLICY "Super admins can delete visual tables"
  ON visual_standing_tables
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
-- TRIGGER: Update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_table_packages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS table_packages_updated_at ON table_packages;
CREATE TRIGGER table_packages_updated_at
  BEFORE UPDATE ON table_packages
  FOR EACH ROW
  EXECUTE FUNCTION update_table_packages_updated_at();