/*
  # Restore brand_slug field to events

  ## Overview
  Restores the brand_slug column that was previously removed.
  This is needed for the agenda and ticket system to work correctly.

  ## Changes
  - Add brand_slug column to events table (nullable, indexed)
  - Create function to generate unique brand slugs
  - Create trigger to auto-generate brand_slug on INSERT
  - Backfill existing events with unique brand_slugs

  ## Brand Slug Logic
  - Format: {slugified-title}-{YYYY-MM-DD}
  - Auto-incremented suffix if duplicate: -2, -3, etc.
  - Automatically set on event creation
*/

-- Add brand_slug column (nullable this time to avoid issues)
ALTER TABLE events ADD COLUMN IF NOT EXISTS brand_slug text;

-- Create function to slugify text
CREATE OR REPLACE FUNCTION slugify(text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(text, '[^\w\s-]', '', 'g'),
        '\s+', '-', 'g'
      ),
      '-+', '-', 'g'
    )
  );
END;
$$;

-- Create function to generate unique brand_slug
CREATE OR REPLACE FUNCTION generate_unique_brand_slug(event_name text, event_date timestamp with time zone)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  base_slug text;
  final_slug text;
  counter integer := 1;
  date_str text;
BEGIN
  -- Format date as YYYY-MM-DD
  date_str := to_char(event_date, 'YYYY-MM-DD');
  
  -- Create base slug: slugified-name-YYYY-MM-DD
  base_slug := slugify(event_name || '-' || date_str);
  final_slug := base_slug;
  
  -- Check for uniqueness and append counter if needed
  WHILE EXISTS (SELECT 1 FROM events WHERE brand_slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  
  RETURN final_slug;
END;
$$;

-- Create trigger function to auto-generate brand_slug
CREATE OR REPLACE FUNCTION set_brand_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only generate if brand_slug is null or empty
  IF NEW.brand_slug IS NULL OR NEW.brand_slug = '' THEN
    NEW.brand_slug := generate_unique_brand_slug(NEW.name, NEW.start_date);
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for INSERT operations
DROP TRIGGER IF EXISTS trigger_set_brand_slug ON events;
CREATE TRIGGER trigger_set_brand_slug
  BEFORE INSERT ON events
  FOR EACH ROW
  EXECUTE FUNCTION set_brand_slug();

-- Backfill existing events with brand_slug
DO $$
DECLARE
  event_record RECORD;
BEGIN
  FOR event_record IN SELECT id, name, start_date FROM events WHERE brand_slug IS NULL OR brand_slug = '' ORDER BY start_date
  LOOP
    UPDATE events
    SET brand_slug = generate_unique_brand_slug(event_record.name, event_record.start_date)
    WHERE id = event_record.id;
  END LOOP;
END $$;

-- Create unique index on brand_slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_brand_slug_unique ON events(brand_slug);

-- Grant permissions
GRANT EXECUTE ON FUNCTION slugify(text) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_unique_brand_slug(text, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION set_brand_slug() TO authenticated;
