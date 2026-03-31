/*
  # Add Order Verification and Admin Notes

  1. Modified Tables
    - `orders`
      - `verified_at` (timestamptz) - When customer identity was verified by admin
      - `verified_by` (uuid) - Which admin verified the customer
      - `admin_notes` (text) - Internal admin notes about the order

  2. New Indexes
    - `idx_orders_order_number` on orders(order_number) for fast order lookup
    - `idx_orders_payer_email` on orders(payer_email) for customer search
    - `idx_orders_verification_code` on orders(verification_code) for verification lookup

  3. Notes
    - These columns support the customer service verification flow
    - Admin can search orders and verify customer identity via verification code
    - Admin notes are internal-only and not visible to customers
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'verified_at'
  ) THEN
    ALTER TABLE orders ADD COLUMN verified_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'verified_by'
  ) THEN
    ALTER TABLE orders ADD COLUMN verified_by uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'admin_notes'
  ) THEN
    ALTER TABLE orders ADD COLUMN admin_notes text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_payer_email ON orders(payer_email);
CREATE INDEX IF NOT EXISTS idx_orders_verification_code ON orders(verification_code);
