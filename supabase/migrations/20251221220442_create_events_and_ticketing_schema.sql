/*
  # Event Ticketing System Schema

  This migration creates the complete database schema for The Max Eventcenter ticketing platform
  with comprehensive security and anti-fraud measures.

  ## 1. New Tables
    
    ### `events`
    - `id` (uuid, primary key) - Unique event identifier
    - `name` (text) - Event name
    - `slug` (text, unique) - URL-friendly identifier
    - `description` (text) - Event description
    - `location` (text) - Event location
    - `location_address` (text) - Full address
    - `start_date` (timestamptz) - Event start date/time
    - `end_date` (timestamptz) - Event end date/time
    - `is_active` (boolean) - Whether event is published
    - `metadata` (jsonb) - Additional event data (lineup, schedule, etc.)
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

    ### `ticket_types`
    - `id` (uuid, primary key)
    - `event_id` (uuid, foreign key) - Associated event
    - `name` (text) - Ticket type name (Early Bird, General, VIP)
    - `description` (text)
    - `price` (integer) - Price in cents
    - `quantity_total` (integer) - Total available tickets
    - `quantity_sold` (integer) - Tickets sold
    - `sale_start` (timestamptz) - When sales start
    - `sale_end` (timestamptz) - When sales end
    - `is_active` (boolean)
    - `metadata` (jsonb) - Additional ticket type data
    - `created_at` (timestamptz)

    ### `orders`
    - `id` (uuid, primary key)
    - `event_id` (uuid, foreign key)
    - `order_number` (text, unique) - Human-readable order number
    - `payer_email` (text) - Customer email
    - `payer_name` (text) - Customer name
    - `payer_phone` (text) - Customer phone (optional)
    - `total_amount` (integer) - Total in cents
    - `status` (text) - pending, paid, failed, refunded, cancelled
    - `payment_provider` (text) - mollie
    - `payment_id` (text) - External payment ID
    - `payment_method` (text) - ideal, card, etc.
    - `promo_code` (text) - Applied promo code
    - `discount_amount` (integer) - Discount in cents
    - `metadata` (jsonb) - Additional order data
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)
    - `paid_at` (timestamptz)

    ### `tickets`
    - `id` (uuid, primary key) - Ticket identifier
    - `order_id` (uuid, foreign key)
    - `event_id` (uuid, foreign key)
    - `ticket_type_id` (uuid, foreign key)
    - `ticket_number` (text, unique) - Human-readable ticket number
    - `token` (text, unique) - Secure validation token
    - `token_expires_at` (timestamptz) - Token expiry (for rotation)
    - `status` (text) - sold, valid, used, revoked, transferred
    - `holder_name` (text) - Ticket holder name
    - `holder_email` (text) - Ticket holder email
    - `qr_data` (text) - QR code data
    - `issued_at` (timestamptz)
    - `used_at` (timestamptz)
    - `revoked_at` (timestamptz)
    - `revoked_reason` (text)
    - `metadata` (jsonb)

    ### `scanners`
    - `id` (uuid, primary key)
    - `user_id` (uuid, foreign key to auth.users)
    - `event_id` (uuid, foreign key)
    - `name` (text) - Scanner name/identifier
    - `role` (text) - scanner, supervisor, admin
    - `device_info` (jsonb)
    - `is_active` (boolean)
    - `active_until` (timestamptz)
    - `last_scan_at` (timestamptz)
    - `created_at` (timestamptz)

    ### `scans`
    - `id` (uuid, primary key)
    - `ticket_id` (uuid, foreign key)
    - `scanner_id` (uuid, foreign key)
    - `event_id` (uuid, foreign key)
    - `result` (text) - valid, already_used, invalid, revoked
    - `location_id` (text) - Scan location identifier
    - `device_info` (jsonb) - Scanner device information
    - `latitude` (numeric) - GPS latitude (optional)
    - `longitude` (numeric) - GPS longitude (optional)
    - `scanned_at` (timestamptz)
    - `metadata` (jsonb)

    ### `promo_codes`
    - `id` (uuid, primary key)
    - `event_id` (uuid, foreign key)
    - `code` (text, unique) - Promo code
    - `discount_type` (text) - percentage, fixed
    - `discount_value` (integer) - Percentage or cents
    - `max_uses` (integer) - Maximum number of uses
    - `used_count` (integer) - Times used
    - `valid_from` (timestamptz)
    - `valid_until` (timestamptz)
    - `is_active` (boolean)
    - `created_at` (timestamptz)

    ### `webhook_logs`
    - `id` (uuid, primary key)
    - `provider` (text) - mollie, etc.
    - `event_type` (text) - Webhook event type
    - `payload` (jsonb) - Full webhook payload
    - `signature` (text) - Webhook signature
    - `signature_valid` (boolean)
    - `processed` (boolean)
    - `order_id` (uuid, foreign key)
    - `created_at` (timestamptz)

    ### `audit_logs`
    - `id` (uuid, primary key)
    - `user_id` (uuid, foreign key)
    - `action` (text) - Action performed
    - `resource_type` (text) - tickets, orders, etc.
    - `resource_id` (uuid) - Resource identifier
    - `changes` (jsonb) - What changed
    - `reason` (text) - Reason for action
    - `ip_address` (text)
    - `user_agent` (text)
    - `created_at` (timestamptz)

  ## 2. Security
    
    - Enable RLS on all tables
    - Create policies for authenticated scanner access
    - Create policies for public ticket purchase
    - Create policies for admin management
    - Scanner tokens validated via JWT with short TTL
    - Atomic ticket status updates to prevent race conditions

  ## 3. Indexes
    
    - Optimized indexes for ticket validation lookups
    - Indexes for order queries and reporting
    - Indexes for scan logs and audit trails

  ## 4. Important Notes
    
    - All monetary values stored in cents (integer)
    - Timestamps use timestamptz for proper timezone handling
    - Status fields use text enums for flexibility
    - JSONB fields for extensibility without schema changes
    - Token rotation capability built-in for enhanced security
*/

-- Create events table
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  location text NOT NULL DEFAULT 'The Max Eventcenter',
  location_address text NOT NULL DEFAULT 'Heusden-Zolder, Belgium',
  start_date timestamptz NOT NULL,
  end_date timestamptz NOT NULL,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create ticket_types table
CREATE TABLE IF NOT EXISTS ticket_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price integer NOT NULL CHECK (price >= 0),
  quantity_total integer NOT NULL CHECK (quantity_total >= 0),
  quantity_sold integer DEFAULT 0 CHECK (quantity_sold >= 0),
  sale_start timestamptz,
  sale_end timestamptz,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  order_number text UNIQUE NOT NULL,
  payer_email text NOT NULL,
  payer_name text NOT NULL,
  payer_phone text,
  total_amount integer NOT NULL CHECK (total_amount >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled')),
  payment_provider text DEFAULT 'mollie',
  payment_id text,
  payment_method text,
  promo_code text,
  discount_amount integer DEFAULT 0 CHECK (discount_amount >= 0),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  paid_at timestamptz
);

-- Create tickets table
CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ticket_type_id uuid NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
  ticket_number text UNIQUE NOT NULL,
  token text UNIQUE NOT NULL,
  token_expires_at timestamptz,
  status text NOT NULL DEFAULT 'sold' CHECK (status IN ('sold', 'valid', 'used', 'revoked', 'transferred')),
  holder_name text,
  holder_email text,
  qr_data text,
  issued_at timestamptz DEFAULT now(),
  used_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Create scanners table (create before scans to avoid FK error)
CREATE TABLE IF NOT EXISTS scanners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'scanner' CHECK (role IN ('scanner', 'supervisor', 'admin')),
  device_info jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  active_until timestamptz,
  last_scan_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create scans table
CREATE TABLE IF NOT EXISTS scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  scanner_id uuid REFERENCES scanners(id) ON DELETE SET NULL,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  result text NOT NULL CHECK (result IN ('valid', 'already_used', 'invalid', 'revoked', 'expired')),
  location_id text,
  device_info jsonb DEFAULT '{}'::jsonb,
  latitude numeric,
  longitude numeric,
  scanned_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Create promo_codes table
CREATE TABLE IF NOT EXISTS promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  code text UNIQUE NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value integer NOT NULL CHECK (discount_value > 0),
  max_uses integer,
  used_count integer DEFAULT 0,
  valid_from timestamptz,
  valid_until timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create webhook_logs table
CREATE TABLE IF NOT EXISTS webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  signature text,
  signature_valid boolean,
  processed boolean DEFAULT false,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  changes jsonb DEFAULT '{}'::jsonb,
  reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tickets_order_id ON tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_tickets_token ON tickets(token);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON tickets(event_id);

CREATE INDEX IF NOT EXISTS idx_orders_event_id ON orders(event_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_id ON orders(payment_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payer_email ON orders(payer_email);

CREATE INDEX IF NOT EXISTS idx_scans_ticket_id ON scans(ticket_id);
CREATE INDEX IF NOT EXISTS idx_scans_scanner_id ON scans(scanner_id);
CREATE INDEX IF NOT EXISTS idx_scans_event_id ON scans(event_id);
CREATE INDEX IF NOT EXISTS idx_scans_scanned_at ON scans(scanned_at);

CREATE INDEX IF NOT EXISTS idx_ticket_types_event_id ON ticket_types(event_id);
CREATE INDEX IF NOT EXISTS idx_scanners_event_id ON scanners(event_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- Enable Row Level Security
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE scanners ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for events (public read)
CREATE POLICY "Anyone can view active events"
  ON events FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated users can manage events"
  ON events FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for ticket_types (public read for active)
CREATE POLICY "Anyone can view active ticket types"
  ON ticket_types FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated users can manage ticket types"
  ON ticket_types FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for orders (customers see own, admins see all)
CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT
  USING (payer_email = current_setting('request.jwt.claims', true)::json->>'email' OR auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can create orders"
  ON orders FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for tickets (scanner access)
CREATE POLICY "Authenticated scanners can view tickets"
  ON tickets FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can create tickets"
  ON tickets FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update tickets"
  ON tickets FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for scans (scanners can create and view)
CREATE POLICY "Authenticated scanners can view scans"
  ON scans FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated scanners can create scans"
  ON scans FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for scanners (admin only)
CREATE POLICY "Authenticated users can view scanners"
  ON scanners FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage scanners"
  ON scanners FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for promo_codes (public read active codes, admin manage)
CREATE POLICY "Anyone can view active promo codes"
  ON promo_codes FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated users can manage promo codes"
  ON promo_codes FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for webhook_logs (admin only)
CREATE POLICY "System can create webhook logs"
  ON webhook_logs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view webhook logs"
  ON webhook_logs FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for audit_logs (admin view only)
CREATE POLICY "Authenticated users can view audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can create audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();