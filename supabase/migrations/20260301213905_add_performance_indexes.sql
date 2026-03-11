/*
  # Performance Indexes for Hot Query Paths

  ## Summary
  Adds targeted indexes to speed up the most frequent query patterns
  identified through code analysis.

  ## New Indexes

  1. `idx_tickets_status` on tickets(status)
     - Supports: unified-scan checking ticket status, admin ticket listings

  2. `idx_tickets_event_status` on tickets(event_id, status)
     - Supports: unified-scan event-scoped ticket lookups, admin event ticket counts

  3. `idx_orders_status` on orders(status)
     - Supports: checkout backpressure check (pending count), admin order filtering

  4. `idx_orders_payer_email` on orders(payer_email)
     - Supports: RLS policy "Users can view own orders" which filters by payer_email

  5. `idx_scans_scanned_at` on scans(scanned_at DESC)
     - Supports: scan log time-range queries, admin audit views

  6. `idx_events_active_brand_date` on events(is_active, brand, start_date)
     - Supports: Home, Agenda, TableReservation public event listings
     - These are the highest-traffic queries on the site

  7. `idx_checkout_rate_limits_key_window` on checkout_rate_limits(key, window_start)
     - Supports: check_rate_limit RPC used by checkout, scan, and validate functions
*/

CREATE INDEX IF NOT EXISTS idx_tickets_status
  ON tickets (status);

CREATE INDEX IF NOT EXISTS idx_tickets_event_status
  ON tickets (event_id, status);

CREATE INDEX IF NOT EXISTS idx_orders_status
  ON orders (status);

CREATE INDEX IF NOT EXISTS idx_orders_payer_email
  ON orders (payer_email);

CREATE INDEX IF NOT EXISTS idx_scans_scanned_at
  ON scans (scanned_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_active_brand_date
  ON events (is_active, brand, start_date)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_checkout_rate_limits_key_window
  ON checkout_rate_limits (key, window_start DESC);
