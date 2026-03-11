/*
  # Backfill Ticket Inventory from Paid Orders

  ## Summary
  This migration recalculates and updates the `quantity_sold` field for all ticket types
  based on ACTUAL paid orders. This is a one-time fix to correct inventory discrepancies.

  ## What it does
  1. Counts all tickets from orders with status='paid' AND created_by_admin_id IS NULL
     (excludes guest/comped tickets which should NEVER affect inventory)
  2. Updates the quantity_sold field for each ticket_type
  3. Logs the changes for audit purposes

  ## Safety
  - This is idempotent: running it multiple times produces the same result
  - Only counts genuinely paid tickets (not guest/comped)
  - Preserves all existing data, only updates quantity_sold

  ## Important Rules Enforced
  - Guest tickets (status='comped', created_by_admin_id IS NOT NULL) do NOT count
  - Table guests do NOT affect ticket inventory
  - Only real paid orders (Mollie payments) are counted
*/

-- Update quantity_sold for each ticket_type based on actual paid orders
UPDATE ticket_types tt
SET quantity_sold = COALESCE(
  (
    SELECT COUNT(*)
    FROM tickets t
    JOIN orders o ON t.order_id = o.id
    WHERE t.ticket_type_id = tt.id
      AND o.status = 'paid'
      AND o.created_by_admin_id IS NULL
  ),
  0
);

-- Log the update for debugging
DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE 'INVENTORY_BACKFILL: Starting inventory recalculation at %', now();
  
  FOR r IN 
    SELECT 
      tt.id,
      tt.name,
      tt.quantity_total,
      tt.quantity_sold,
      e.name as event_name
    FROM ticket_types tt
    JOIN events e ON tt.event_id = e.id
    ORDER BY e.name, tt.name
  LOOP
    RAISE NOTICE 'INVENTORY: [%] % - sold: %/% total', 
      r.event_name, r.name, r.quantity_sold, r.quantity_total;
  END LOOP;
  
  RAISE NOTICE 'INVENTORY_BACKFILL: Completed at %', now();
END $$;
