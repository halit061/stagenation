/*
  # Add Ticket Scarcity Display Feature

  1. New Columns Added to ticket_types
    - `show_remaining_tickets` (boolean): Enable/disable scarcity display
    - `remaining_display_threshold` (integer): Show only when remaining <= threshold
    - `low_stock_threshold` (integer): Trigger low stock message
    - `scarcity_label_mode` (text): Display mode (exact/rounded_bucket/message_only)
    - `rounded_bucket_size` (integer): Bucket size for rounded mode
    - `scarcity_text_normal` (jsonb): Normal stock message templates by language
    - `scarcity_text_low` (jsonb): Low stock message templates by language
    - `scarcity_text_soldout` (jsonb): Sold out message templates by language
    - `show_soldout_label` (boolean): Show soldout label when remaining=0

  2. Security
    - Only SuperAdmin can edit scarcity fields
    - Public can view (calculated on read)

  3. RPC Function
    - `get_ticket_types_with_remaining`: Efficiently compute remaining for all ticket types
*/

-- Add scarcity display columns to ticket_types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_types' AND column_name = 'show_remaining_tickets'
  ) THEN
    ALTER TABLE ticket_types ADD COLUMN show_remaining_tickets BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_types' AND column_name = 'remaining_display_threshold'
  ) THEN
    ALTER TABLE ticket_types ADD COLUMN remaining_display_threshold INTEGER NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_types' AND column_name = 'low_stock_threshold'
  ) THEN
    ALTER TABLE ticket_types ADD COLUMN low_stock_threshold INTEGER NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_types' AND column_name = 'scarcity_label_mode'
  ) THEN
    ALTER TABLE ticket_types ADD COLUMN scarcity_label_mode TEXT NOT NULL DEFAULT 'exact' CHECK (scarcity_label_mode IN ('exact', 'rounded_bucket', 'message_only'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_types' AND column_name = 'rounded_bucket_size'
  ) THEN
    ALTER TABLE ticket_types ADD COLUMN rounded_bucket_size INTEGER NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_types' AND column_name = 'scarcity_text_normal'
  ) THEN
    ALTER TABLE ticket_types ADD COLUMN scarcity_text_normal JSONB NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_types' AND column_name = 'scarcity_text_low'
  ) THEN
    ALTER TABLE ticket_types ADD COLUMN scarcity_text_low JSONB NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_types' AND column_name = 'scarcity_text_soldout'
  ) THEN
    ALTER TABLE ticket_types ADD COLUMN scarcity_text_soldout JSONB NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_types' AND column_name = 'show_soldout_label'
  ) THEN
    ALTER TABLE ticket_types ADD COLUMN show_soldout_label BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;
END $$;

-- Add constraints for thresholds (must be positive if set)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'ticket_types_remaining_threshold_positive'
  ) THEN
    ALTER TABLE ticket_types ADD CONSTRAINT ticket_types_remaining_threshold_positive
      CHECK (remaining_display_threshold IS NULL OR remaining_display_threshold > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'ticket_types_low_stock_threshold_positive'
  ) THEN
    ALTER TABLE ticket_types ADD CONSTRAINT ticket_types_low_stock_threshold_positive
      CHECK (low_stock_threshold IS NULL OR low_stock_threshold > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'ticket_types_bucket_size_positive'
  ) THEN
    ALTER TABLE ticket_types ADD CONSTRAINT ticket_types_bucket_size_positive
      CHECK (rounded_bucket_size IS NULL OR rounded_bucket_size > 0);
  END IF;
END $$;

-- RPC function to get ticket types with computed remaining count
CREATE OR REPLACE FUNCTION get_ticket_types_with_remaining(p_event_id UUID)
RETURNS TABLE (
  id UUID,
  event_id UUID,
  name TEXT,
  description TEXT,
  price INTEGER,
  quantity_total INTEGER,
  quantity_sold INTEGER,
  remaining INTEGER,
  sale_start TIMESTAMPTZ,
  sale_end TIMESTAMPTZ,
  is_active BOOLEAN,
  show_remaining_tickets BOOLEAN,
  remaining_display_threshold INTEGER,
  low_stock_threshold INTEGER,
  scarcity_label_mode TEXT,
  rounded_bucket_size INTEGER,
  scarcity_text_normal JSONB,
  scarcity_text_low JSONB,
  scarcity_text_soldout JSONB,
  show_soldout_label BOOLEAN,
  metadata JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tt.id,
    tt.event_id,
    tt.name,
    tt.description,
    tt.price,
    tt.quantity_total,
    tt.quantity_sold,
    GREATEST(0, tt.quantity_total - COALESCE(
      (SELECT COUNT(*)
       FROM tickets t
       WHERE t.ticket_type_id = tt.id
       AND t.status IN ('valid', 'used')
      ), 0
    ))::INTEGER AS remaining,
    tt.sale_start,
    tt.sale_end,
    tt.is_active,
    tt.show_remaining_tickets,
    tt.remaining_display_threshold,
    tt.low_stock_threshold,
    tt.scarcity_label_mode,
    tt.rounded_bucket_size,
    tt.scarcity_text_normal,
    tt.scarcity_text_low,
    tt.scarcity_text_soldout,
    tt.show_soldout_label,
    tt.metadata,
    tt.created_at
  FROM ticket_types tt
  WHERE tt.event_id = p_event_id
  ORDER BY tt.created_at;
END;
$$;

-- Grant execute permission to authenticated users (public can call this)
GRANT EXECUTE ON FUNCTION get_ticket_types_with_remaining(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ticket_types_with_remaining(UUID) TO anon;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_type_status ON tickets(ticket_type_id, status);