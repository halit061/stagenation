/*
  # Add configurable service fees to ticket types and fee breakdown to orders

  1. Modified Tables
    - `ticket_types`
      - Added `service_fee_mode` (text, default 'none') - 'none', 'fixed', or 'percent'
      - Added `service_fee_fixed` (numeric(10,2), default 0) - fixed fee in euros (0.01-9.99)
      - Added `service_fee_percent` (numeric(5,2), default 0) - percentage fee (0.1-25)
      - Added constraint to enforce only one fee type active at a time
    - `orders`
      - Added `service_fee_total_cents` (integer, default 0) - total service fees in cents
      - Added `platform_fee_total_cents` (integer, default 0) - platform fees (0.99/ticket) in cents
      - Added `provider_fee_total_cents` (integer, default 0) - payment provider fees in cents
      - Added `net_revenue_cents` (integer, default 0) - net revenue after all costs

  2. Notes
    - Existing ticket types default to 'none' (no service fee) - backwards compatible
    - Existing orders get 0 for all new fee fields - backwards compatible
    - Constraints ensure data integrity for fee configuration
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_types' AND column_name = 'service_fee_mode'
  ) THEN
    ALTER TABLE ticket_types ADD COLUMN service_fee_mode text NOT NULL DEFAULT 'none';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_types' AND column_name = 'service_fee_fixed'
  ) THEN
    ALTER TABLE ticket_types ADD COLUMN service_fee_fixed numeric(10,2) NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_types' AND column_name = 'service_fee_percent'
  ) THEN
    ALTER TABLE ticket_types ADD COLUMN service_fee_percent numeric(5,2) NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'service_fee_total_cents'
  ) THEN
    ALTER TABLE orders ADD COLUMN service_fee_total_cents integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'platform_fee_total_cents'
  ) THEN
    ALTER TABLE orders ADD COLUMN platform_fee_total_cents integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'provider_fee_total_cents'
  ) THEN
    ALTER TABLE orders ADD COLUMN provider_fee_total_cents integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'net_revenue_cents'
  ) THEN
    ALTER TABLE orders ADD COLUMN net_revenue_cents integer NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_service_fee_mode_values'
  ) THEN
    ALTER TABLE ticket_types ADD CONSTRAINT check_service_fee_mode_values
      CHECK (service_fee_mode IN ('none', 'fixed', 'percent'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_service_fee_logic'
  ) THEN
    ALTER TABLE ticket_types ADD CONSTRAINT check_service_fee_logic
      CHECK (
        (service_fee_mode = 'none' AND service_fee_fixed = 0 AND service_fee_percent = 0) OR
        (service_fee_mode = 'fixed' AND service_fee_fixed BETWEEN 0.01 AND 9.99 AND service_fee_percent = 0) OR
        (service_fee_mode = 'percent' AND service_fee_percent BETWEEN 0.1 AND 25 AND service_fee_fixed = 0)
      );
  END IF;
END $$;