/*
  # Capacity auto-sync trigger and performance indexes

  1. New View
    - `seat_sections_with_counts`: Provides live seat counts per section
      - `available_count` - seats with status 'available'
      - `blocked_count` - seats with status 'blocked'
      - `reserved_count` - seats with status 'reserved'
      - `sold_count` - seats with status 'sold'
      - `actual_capacity` - total seat count

  2. New Trigger
    - `trg_sync_section_capacity` on `seats` table
      - Fires AFTER INSERT, UPDATE, DELETE on seats
      - Automatically updates `seat_sections.capacity` to match actual seat count
      - Handles row-level changes including section_id changes

  3. Backfill
    - Updates all existing seat_sections.capacity to match actual seat counts

  4. New Indexes
    - `idx_seats_section_id` on seats(section_id)
    - `idx_seats_status` on seats(status)
    - `idx_seats_section_status` on seats(section_id, status)
    - `idx_seat_sections_layout_id` on seat_sections(layout_id)

  5. Important Notes
    - The trigger ensures capacity is never out of sync again
    - The view provides real-time counts without needing to maintain them manually
    - Indexes improve query performance for large seat datasets (10,000+)
*/

-- 1. Create view for live seat counts
CREATE OR REPLACE VIEW seat_sections_with_counts AS
SELECT
  ss.*,
  COUNT(s.id) FILTER (WHERE s.status = 'available') AS available_count,
  COUNT(s.id) FILTER (WHERE s.status = 'blocked') AS blocked_count,
  COUNT(s.id) FILTER (WHERE s.status = 'reserved') AS reserved_count,
  COUNT(s.id) FILTER (WHERE s.status = 'sold') AS sold_count,
  COUNT(s.id) AS actual_capacity
FROM seat_sections ss
LEFT JOIN seats s ON s.section_id = ss.id
GROUP BY ss.id;

-- 2. Create trigger function for capacity auto-sync
CREATE OR REPLACE FUNCTION sync_section_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE seat_sections
    SET capacity = (SELECT COUNT(*) FROM seats WHERE section_id = OLD.section_id)
    WHERE id = OLD.section_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND OLD.section_id IS DISTINCT FROM NEW.section_id THEN
    UPDATE seat_sections
    SET capacity = (SELECT COUNT(*) FROM seats WHERE section_id = OLD.section_id)
    WHERE id = OLD.section_id;
    UPDATE seat_sections
    SET capacity = (SELECT COUNT(*) FROM seats WHERE section_id = NEW.section_id)
    WHERE id = NEW.section_id;
    RETURN NEW;
  ELSE
    UPDATE seat_sections
    SET capacity = (SELECT COUNT(*) FROM seats WHERE section_id = NEW.section_id)
    WHERE id = NEW.section_id;
    RETURN NEW;
  END IF;
END;
$$;

-- 3. Create trigger
DROP TRIGGER IF EXISTS trg_sync_section_capacity ON seats;
CREATE TRIGGER trg_sync_section_capacity
AFTER INSERT OR UPDATE OR DELETE ON seats
FOR EACH ROW EXECUTE FUNCTION sync_section_capacity();

-- 4. Backfill all existing sections
UPDATE seat_sections ss
SET capacity = (SELECT COUNT(*) FROM seats s WHERE s.section_id = ss.id);

-- 5. Performance indexes
CREATE INDEX IF NOT EXISTS idx_seats_section_id ON seats(section_id);
CREATE INDEX IF NOT EXISTS idx_seats_status ON seats(status);
CREATE INDEX IF NOT EXISTS idx_seats_section_status ON seats(section_id, status);
CREATE INDEX IF NOT EXISTS idx_seat_sections_layout_id ON seat_sections(layout_id);
