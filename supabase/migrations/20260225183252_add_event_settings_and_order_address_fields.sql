/*
  # Add event settings and order address fields

  1. Modified Tables
    - `events`
      - `floorplan_enabled` (boolean, default false) - toggle floorplan per event
      - `floorplan_data` (jsonb, nullable) - JSON layout data for floorplan
      - `floorplan_image_url` (text, nullable) - uploaded floorplan image
      - `service_fee_enabled` (boolean, default false) - toggle service fee per event
      - `service_fee_amount` (integer, default 0) - service fee amount in cents per ticket
    - `orders`
      - `billing_street` (text, nullable) - customer billing street
      - `billing_number` (text, nullable) - customer billing house number
      - `billing_postal_code` (text, nullable) - customer billing postal code
      - `billing_city` (text, nullable) - customer billing city
      - `billing_country` (text, nullable) - customer billing country

  2. Notes
    - All columns are additive (no destructive changes)
    - Default values ensure backward compatibility with existing events/orders
    - Floorplan and service fee are disabled by default
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'floorplan_enabled'
  ) THEN
    ALTER TABLE events ADD COLUMN floorplan_enabled boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'floorplan_data'
  ) THEN
    ALTER TABLE events ADD COLUMN floorplan_data jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'floorplan_image_url'
  ) THEN
    ALTER TABLE events ADD COLUMN floorplan_image_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'service_fee_enabled'
  ) THEN
    ALTER TABLE events ADD COLUMN service_fee_enabled boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'service_fee_amount'
  ) THEN
    ALTER TABLE events ADD COLUMN service_fee_amount integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'billing_street'
  ) THEN
    ALTER TABLE orders ADD COLUMN billing_street text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'billing_number'
  ) THEN
    ALTER TABLE orders ADD COLUMN billing_number text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'billing_postal_code'
  ) THEN
    ALTER TABLE orders ADD COLUMN billing_postal_code text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'billing_city'
  ) THEN
    ALTER TABLE orders ADD COLUMN billing_city text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'billing_country'
  ) THEN
    ALTER TABLE orders ADD COLUMN billing_country text;
  END IF;
END $$;