/*
  # Add product_type field to tickets and orders

  1. Changes
    - Add `product_type` ENUM type with values: REGULAR, VIP, TABLE
    - Add `product_type` column to `tickets` table
    - Add `product_type` column to `orders` table
    - Set default value to 'REGULAR' for existing records
    - Add indexes for efficient querying by product_type
  
  2. Notes
    - All existing tickets/orders will be marked as REGULAR
    - Table reservations will be marked as TABLE
    - VIP tickets will be marked as VIP
*/

-- Create product_type enum if it doesn't exist
DO $$ BEGIN
  CREATE TYPE product_type AS ENUM ('REGULAR', 'VIP', 'TABLE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add product_type column to tickets table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tickets' AND column_name = 'product_type'
  ) THEN
    ALTER TABLE tickets ADD COLUMN product_type product_type DEFAULT 'REGULAR' NOT NULL;
  END IF;
END $$;

-- Add product_type column to orders table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'product_type'
  ) THEN
    ALTER TABLE orders ADD COLUMN product_type product_type DEFAULT 'REGULAR' NOT NULL;
  END IF;
END $$;

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_tickets_product_type ON tickets(product_type);
CREATE INDEX IF NOT EXISTS idx_orders_product_type ON orders(product_type);

-- Update existing table bookings/orders to have product_type = 'TABLE'
UPDATE orders
SET product_type = 'TABLE'
WHERE id IN (
  SELECT DISTINCT order_id
  FROM table_bookings
  WHERE order_id IS NOT NULL
);

-- Add comment for documentation
COMMENT ON COLUMN tickets.product_type IS 'Type of product: REGULAR (standard tickets), VIP (VIP tickets), TABLE (table reservations)';
COMMENT ON COLUMN orders.product_type IS 'Type of product: REGULAR (standard tickets), VIP (VIP tickets), TABLE (table reservations)';
