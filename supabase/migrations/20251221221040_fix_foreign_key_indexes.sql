/*
  # Add missing foreign key indexes for performance
  
  1. Changes
    - Add index on scans.scanner_id for foreign key performance
    - Add index on scans.ticket_id for foreign key performance
    - Add index on table_reservations.event_id for foreign key performance
    - Add index on tickets.order_id for foreign key performance
  
  2. Performance Impact
    - Improves JOIN performance on foreign key columns
    - Optimizes queries filtering by these foreign keys
*/

-- Add index for scans.scanner_id foreign key
CREATE INDEX IF NOT EXISTS idx_scans_scanner_id ON scans(scanner_id);

-- Add index for scans.ticket_id foreign key
CREATE INDEX IF NOT EXISTS idx_scans_ticket_id ON scans(ticket_id);

-- Add index for table_reservations.event_id foreign key
CREATE INDEX IF NOT EXISTS idx_table_reservations_event_id ON table_reservations(event_id);

-- Add index for tickets.order_id foreign key
CREATE INDEX IF NOT EXISTS idx_tickets_order_id ON tickets(order_id);