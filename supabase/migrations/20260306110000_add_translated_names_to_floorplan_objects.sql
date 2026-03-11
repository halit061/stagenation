/*
  # Add translated name columns to floorplan objects

  Allows floorplan object labels to display in the user's
  selected language (nl, tr, fr, de).
*/

ALTER TABLE floorplan_objects
  ADD COLUMN IF NOT EXISTS name_nl text,
  ADD COLUMN IF NOT EXISTS name_tr text,
  ADD COLUMN IF NOT EXISTS name_fr text,
  ADD COLUMN IF NOT EXISTS name_de text;
