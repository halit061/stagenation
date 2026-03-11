/*
  # Fix Guest Tickets to Use Existing Tables

  1. Changes
    - Drop guest_tickets table (not needed - use existing orders/tickets)
    - Update orders table to support 'comped' status for guest tickets
    - Update guest_ticket_audit_log to reference order_id and ticket_id
    - Add metadata column to orders for tracking admin who created it

  2. Security
    - Maintain existing RLS policies
    - Audit log remains SuperAdmin-only visible

  3. Purpose
    - Guest tickets will be regular orders with status='comped' and total_amount=0
    - Guest tickets will be regular tickets with metadata indicating they're guest tickets
    - This ensures scanner compatibility without changes
*/

-- Drop the guest_tickets table (we'll use orders + tickets instead)
DROP TABLE IF EXISTS guest_tickets CASCADE;

-- Update orders status constraint to include 'comped'
DO $$
BEGIN
  -- Drop the existing constraint
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
  
  -- Add the updated constraint with 'comped'
  ALTER TABLE orders ADD CONSTRAINT orders_status_check 
    CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled', 'comped'));
END $$;

-- Update guest_ticket_audit_log to reference order_id and ticket_id instead
ALTER TABLE guest_ticket_audit_log DROP COLUMN IF EXISTS guest_ticket_id;
ALTER TABLE guest_ticket_audit_log ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE guest_ticket_audit_log ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES tickets(id) ON DELETE SET NULL;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_guest_ticket_audit_log_order_id ON guest_ticket_audit_log(order_id);
CREATE INDEX IF NOT EXISTS idx_guest_ticket_audit_log_ticket_id ON guest_ticket_audit_log(ticket_id);

-- Add a column to track admin who created orders (for comped/guest orders)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'created_by_admin_id'
  ) THEN
    ALTER TABLE orders ADD COLUMN created_by_admin_id uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- Update the tickets status constraint to be more flexible (already includes 'valid' which we'll use)
-- No changes needed for tickets table

COMMENT ON COLUMN orders.created_by_admin_id IS 'Admin user who created this order (for comped/guest tickets)';
COMMENT ON TABLE guest_ticket_audit_log IS 'Immutable audit log for guest ticket operations (SuperAdmin only)';
