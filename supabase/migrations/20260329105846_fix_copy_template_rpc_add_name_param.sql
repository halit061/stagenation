/*
  # Fix copy_template_for_event function signature

  1. Changes
    - Drops and recreates copy_template_for_event function
    - Adds p_new_name parameter to allow custom naming of copied layout
    - Removes p_brand_id parameter (copies brand_id from source template)
    - Resets all seat statuses to 'available' in the copy
    - Deep copies layout, sections, and seats atomically

  2. Security
    - SECURITY DEFINER with search_path = public
    - Granted to authenticated users only
*/

DROP FUNCTION IF EXISTS copy_template_for_event(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION copy_template_for_event(
  p_template_id UUID,
  p_event_id UUID,
  p_new_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_layout_id UUID;
  v_new_section_id UUID;
  v_layout_name TEXT;
  r RECORD;
BEGIN
  SELECT name INTO v_layout_name
  FROM venue_layouts WHERE id = p_template_id;

  IF v_layout_name IS NULL THEN
    RAISE EXCEPTION 'Template not found: %', p_template_id;
  END IF;

  IF p_new_name IS NOT NULL AND p_new_name <> '' THEN
    v_layout_name := p_new_name;
  ELSE
    v_layout_name := v_layout_name || ' (kopie)';
  END IF;

  INSERT INTO venue_layouts (name, layout_data, brand_id, event_id, is_template, source_template_id)
  SELECT v_layout_name, layout_data, brand_id, p_event_id, false, p_template_id
  FROM venue_layouts
  WHERE id = p_template_id
  RETURNING id INTO v_new_layout_id;

  FOR r IN
    SELECT * FROM seat_sections
    WHERE layout_id = p_template_id AND is_active = true
  LOOP
    INSERT INTO seat_sections (
      layout_id, name, section_type, capacity, color,
      price_category, price_amount, position_x, position_y,
      width, height, rotation, rows_count, seats_per_row,
      row_curve, sort_order, is_active, orientation
    )
    VALUES (
      v_new_layout_id, r.name, r.section_type, r.capacity, r.color,
      r.price_category, r.price_amount, r.position_x, r.position_y,
      r.width, r.height, r.rotation, r.rows_count, r.seats_per_row,
      r.row_curve, r.sort_order, true, r.orientation
    )
    RETURNING id INTO v_new_section_id;

    INSERT INTO seats (
      section_id, row_label, seat_number, x_position, y_position,
      status, price_override, seat_type, metadata, is_active
    )
    SELECT
      v_new_section_id, row_label, seat_number, x_position, y_position,
      'available', price_override, seat_type, metadata, true
    FROM seats
    WHERE section_id = r.id AND is_active = true;
  END LOOP;

  RETURN v_new_layout_id;
END;
$$;

GRANT EXECUTE ON FUNCTION copy_template_for_event(UUID, UUID, TEXT) TO authenticated;
