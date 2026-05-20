/*
  # Add traffic source tracking to orders

  1. Modified Tables
    - `orders`
      - `utm_source` (varchar 200, nullable) - Traffic source (e.g., facebook, google, studio100)
      - `utm_medium` (varchar 200, nullable) - Marketing medium (e.g., email, cpc, social)
      - `utm_campaign` (varchar 200, nullable) - Campaign name (e.g., mail_22mei)
      - `utm_content` (varchar 200, nullable) - Ad content identifier
      - `utm_term` (varchar 200, nullable) - Search term used
      - `referrer` (varchar 500, nullable) - HTTP referrer URL at first visit
      - `landing_page` (varchar 500, nullable) - First page URL the visitor landed on
      - `first_visit_at` (timestamptz, nullable) - Timestamp of first visit in session

  2. Performance
    - Index on utm_source for fast filtering (partial, only non-null values)

  3. Important Notes
    - All columns are nullable so existing orders are unaffected
    - No existing columns or indexes are modified
    - No RLS policies are changed
    - This is purely additive
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'utm_source'
  ) THEN
    ALTER TABLE orders ADD COLUMN utm_source VARCHAR(200);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'utm_medium'
  ) THEN
    ALTER TABLE orders ADD COLUMN utm_medium VARCHAR(200);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'utm_campaign'
  ) THEN
    ALTER TABLE orders ADD COLUMN utm_campaign VARCHAR(200);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'utm_content'
  ) THEN
    ALTER TABLE orders ADD COLUMN utm_content VARCHAR(200);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'utm_term'
  ) THEN
    ALTER TABLE orders ADD COLUMN utm_term VARCHAR(200);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'referrer'
  ) THEN
    ALTER TABLE orders ADD COLUMN referrer VARCHAR(500);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'landing_page'
  ) THEN
    ALTER TABLE orders ADD COLUMN landing_page VARCHAR(500);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'first_visit_at'
  ) THEN
    ALTER TABLE orders ADD COLUMN first_visit_at TIMESTAMPTZ;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_utm_source
  ON orders(utm_source)
  WHERE utm_source IS NOT NULL;
