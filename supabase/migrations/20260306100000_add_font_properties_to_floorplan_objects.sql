/*
  # Add font customization to floorplan objects

  Allows admins to customize text appearance (size, color, weight)
  for floorplan objects like STAGE, BAR, etc.
*/

ALTER TABLE floorplan_objects
  ADD COLUMN IF NOT EXISTS font_size integer DEFAULT 14,
  ADD COLUMN IF NOT EXISTS font_color text DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS font_weight text DEFAULT 'bold';
