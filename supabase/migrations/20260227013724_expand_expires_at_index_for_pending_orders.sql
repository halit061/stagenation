/*
  # Expand expires_at index to cover both reserved and pending orders

  1. Changes
    - Drops existing partial index `idx_orders_expires_at` which only covers status='reserved'
    - Creates new partial index covering both 'reserved' AND 'pending' statuses
    - This allows efficient expiry lookups for orders in either state

  2. Security
    - No RLS changes
    - No data changes
    - Index-only operation
*/

DROP INDEX IF EXISTS public.idx_orders_expires_at;

CREATE INDEX IF NOT EXISTS idx_orders_expires_at
  ON public.orders (expires_at)
  WHERE expires_at IS NOT NULL AND status IN ('reserved', 'pending');
