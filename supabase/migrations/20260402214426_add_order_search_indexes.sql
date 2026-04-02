/*
  # Add search indexes for orders and ticket_seats

  1. New Indexes
    - `idx_orders_order_number` on orders(order_number) for fast order number lookups
    - `idx_orders_payer_email` on orders(payer_email) for email searches
    - `idx_orders_payer_name` on orders(payer_name) for name searches
    - `idx_orders_verification_code` on orders(verification_code) for verification code lookups
    - `idx_orders_status` on orders(status) for status filtering
    - `idx_orders_event_id` on orders(event_id) for event filtering
    - `idx_ticket_seats_ticket_code` on ticket_seats(ticket_code) for ticket code searches
    - `idx_ticket_seats_order_id` on ticket_seats(order_id) for order-ticket joins

  2. Purpose
    - Enables fast admin order search across multiple fields
    - Supports filtering by status and event
    - Allows searching by ticket code via ticket_seats join
*/

CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_payer_email ON orders(payer_email);
CREATE INDEX IF NOT EXISTS idx_orders_payer_name ON orders(payer_name);
CREATE INDEX IF NOT EXISTS idx_orders_verification_code ON orders(verification_code);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_event_id ON orders(event_id);
CREATE INDEX IF NOT EXISTS idx_ticket_seats_ticket_code ON ticket_seats(ticket_code);
CREATE INDEX IF NOT EXISTS idx_ticket_seats_order_id ON ticket_seats(order_id);
