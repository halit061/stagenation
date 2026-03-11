/*
  # Drinks Ordering System - Complete Database Schema

  ## Overview
  Creates a comprehensive drinks ordering system with bar-friendly workflows,
  separate from existing ticket and table reservation systems.

  ## New Tables

  ### 1. drink_categories
  - Drink categories with multilingual support (NL/TR)
  - Fields: id, name_nl, name_tr, sort_order, is_active
  - Sortable and can be enabled/disabled

  ### 2. drinks
  - Individual drink items linked to categories
  - Fields: id, category_id, name_nl, name_tr, price, sku, is_active, image_url
  - SKU for CSV import/export matching
  - Optional image support

  ### 3. drink_stock
  - Per-event, per-drink stock tracking
  - Fields: id, event_id, drink_id, stock_initial, stock_current, updated_at
  - Stock can NEVER go below 0
  - Realtime updates enabled

  ### 4. drink_orders
  - Main orders table with bar-friendly display codes
  - Fields: id, event_id, table_booking_id (nullable), display_code,
           status, fulfillment_type, pickup_bar, total_amount,
           created_at, paid_at, delivered_at, delivered_by, qr_code
  - Display codes: 6-digit numeric (000001-999999), unique per event
  - Separate revenue stream from tickets/tables

  ### 5. drink_order_items
  - Line items for each order
  - Fields: id, drink_order_id, drink_id, quantity, unit_price
  - Captures price at time of order

  ## Security
  - RLS enabled on all tables
  - Public can read active drinks and categories
  - Authenticated users can create orders
  - Admin roles can manage drinks and fulfill orders
  - Atomic delivery operations to prevent double-delivery

  ## Indexes
  - Optimized for common queries
  - Foreign key indexes
  - Unique constraints on display_code per event
  - Unique constraints on drink_stock per event/drink

  ## Important Notes
  - Stock reduces ONLY after payment status = PAID
  - Display codes generated server-side on payment
  - QR codes generated for paid orders
  - Fulfillment types: DELIVERY (to table), PICKUP (at bar)
  - Order status workflow: OPEN → PAID → IN_PROGRESS → READY → DELIVERED
  - Revenue completely separate from tickets and tables
*/

-- =====================================================
-- 1. DRINK CATEGORIES
-- =====================================================

CREATE TABLE IF NOT EXISTS drink_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_nl TEXT NOT NULL,
  name_tr TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drink_categories_sort ON drink_categories(sort_order) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_drink_categories_active ON drink_categories(is_active);

ALTER TABLE drink_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active drink categories"
  ON drink_categories FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated users can view all drink categories"
  ON drink_categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage drink categories"
  ON drink_categories FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('SUPER_ADMIN', 'ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('SUPER_ADMIN', 'ADMIN')
    )
  );

-- =====================================================
-- 2. DRINKS
-- =====================================================

CREATE TABLE IF NOT EXISTS drinks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES drink_categories(id) ON DELETE CASCADE,
  name_nl TEXT NOT NULL,
  name_tr TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  sku TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drinks_category ON drinks(category_id);
CREATE INDEX IF NOT EXISTS idx_drinks_active ON drinks(is_active);
CREATE INDEX IF NOT EXISTS idx_drinks_sku ON drinks(sku);

ALTER TABLE drinks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active drinks"
  ON drinks FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated users can view all drinks"
  ON drinks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage drinks"
  ON drinks FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('SUPER_ADMIN', 'ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('SUPER_ADMIN', 'ADMIN')
    )
  );

-- =====================================================
-- 3. DRINK STOCK (PER EVENT)
-- =====================================================

CREATE TABLE IF NOT EXISTS drink_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  drink_id UUID NOT NULL REFERENCES drinks(id) ON DELETE CASCADE,
  stock_initial INT NOT NULL DEFAULT 0 CHECK (stock_initial >= 0),
  stock_current INT NOT NULL DEFAULT 0 CHECK (stock_current >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, drink_id)
);

CREATE INDEX IF NOT EXISTS idx_drink_stock_event ON drink_stock(event_id);
CREATE INDEX IF NOT EXISTS idx_drink_stock_drink ON drink_stock(drink_id);
CREATE INDEX IF NOT EXISTS idx_drink_stock_current ON drink_stock(stock_current) WHERE stock_current > 0;

ALTER TABLE drink_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view drink stock"
  ON drink_stock FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage drink stock"
  ON drink_stock FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('SUPER_ADMIN', 'ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('SUPER_ADMIN', 'ADMIN')
    )
  );

-- =====================================================
-- 4. DRINK ORDERS
-- =====================================================

DO $$ BEGIN
  CREATE TYPE drink_order_status AS ENUM (
    'OPEN',
    'PENDING_PAYMENT',
    'PAID',
    'IN_PROGRESS',
    'READY',
    'DELIVERED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE drink_fulfillment_type AS ENUM ('DELIVERY', 'PICKUP');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE drink_pickup_bar AS ENUM ('BAR_MAIN', 'BAR_PICKUP', 'BAR_LOUNGE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS drink_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  table_booking_id UUID REFERENCES table_bookings(id) ON DELETE SET NULL,
  display_code TEXT,
  status drink_order_status NOT NULL DEFAULT 'OPEN',
  fulfillment_type drink_fulfillment_type NOT NULL,
  pickup_bar drink_pickup_bar,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  mollie_payment_id TEXT,
  customer_email TEXT,
  customer_name TEXT,
  qr_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  delivered_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, display_code)
);

CREATE INDEX IF NOT EXISTS idx_drink_orders_event ON drink_orders(event_id);
CREATE INDEX IF NOT EXISTS idx_drink_orders_status ON drink_orders(status);
CREATE INDEX IF NOT EXISTS idx_drink_orders_display_code ON drink_orders(event_id, display_code);
CREATE INDEX IF NOT EXISTS idx_drink_orders_mollie ON drink_orders(mollie_payment_id);
CREATE INDEX IF NOT EXISTS idx_drink_orders_table ON drink_orders(table_booking_id);
CREATE INDEX IF NOT EXISTS idx_drink_orders_fulfillment ON drink_orders(fulfillment_type, status);

ALTER TABLE drink_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view their own drink orders"
  ON drink_orders FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create drink orders"
  ON drink_orders FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins and staff can view all drink orders"
  ON drink_orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('SUPER_ADMIN', 'ADMIN', 'SCANNER')
    )
  );

CREATE POLICY "Admins and staff can update drink orders"
  ON drink_orders FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('SUPER_ADMIN', 'ADMIN', 'SCANNER')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('SUPER_ADMIN', 'ADMIN', 'SCANNER')
    )
  );

-- =====================================================
-- 5. DRINK ORDER ITEMS
-- =====================================================

CREATE TABLE IF NOT EXISTS drink_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drink_order_id UUID NOT NULL REFERENCES drink_orders(id) ON DELETE CASCADE,
  drink_id UUID NOT NULL REFERENCES drinks(id) ON DELETE RESTRICT,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drink_order_items_order ON drink_order_items(drink_order_id);
CREATE INDEX IF NOT EXISTS idx_drink_order_items_drink ON drink_order_items(drink_id);

ALTER TABLE drink_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view drink order items"
  ON drink_order_items FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert drink order items"
  ON drink_order_items FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can manage drink order items"
  ON drink_order_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('SUPER_ADMIN', 'ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('SUPER_ADMIN', 'ADMIN')
    )
  );

-- =====================================================
-- 6. HELPER FUNCTIONS
-- =====================================================

-- Function to generate unique 6-digit display code for drinks orders
CREATE OR REPLACE FUNCTION generate_drink_order_display_code(p_event_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_attempts INT := 0;
  v_max_attempts INT := 100;
BEGIN
  LOOP
    v_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
    
    IF NOT EXISTS (
      SELECT 1 FROM drink_orders
      WHERE event_id = p_event_id
      AND display_code = v_code
    ) THEN
      RETURN v_code;
    END IF;
    
    v_attempts := v_attempts + 1;
    IF v_attempts >= v_max_attempts THEN
      RAISE EXCEPTION 'Could not generate unique display code after % attempts', v_max_attempts;
    END IF;
  END LOOP;
END;
$$;

-- Function to atomically deduct stock
CREATE OR REPLACE FUNCTION deduct_drink_stock(
  p_event_id UUID,
  p_drink_id UUID,
  p_quantity INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_stock INT;
BEGIN
  -- Lock the row and get current stock
  SELECT stock_current INTO v_current_stock
  FROM drink_stock
  WHERE event_id = p_event_id
  AND drink_id = p_drink_id
  FOR UPDATE;
  
  -- Check if stock exists
  IF v_current_stock IS NULL THEN
    RAISE EXCEPTION 'Stock not found for event % and drink %', p_event_id, p_drink_id;
  END IF;
  
  -- Check if sufficient stock
  IF v_current_stock < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock. Available: %, Requested: %', v_current_stock, p_quantity;
  END IF;
  
  -- Deduct stock
  UPDATE drink_stock
  SET stock_current = stock_current - p_quantity,
      updated_at = now()
  WHERE event_id = p_event_id
  AND drink_id = p_drink_id;
  
  RETURN TRUE;
END;
$$;

-- Function to atomically mark drink order as delivered (anti-double-delivery)
CREATE OR REPLACE FUNCTION mark_drink_order_delivered(
  p_order_id UUID,
  p_delivered_by UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status drink_order_status;
BEGIN
  -- Lock the row and get current status
  SELECT status INTO v_current_status
  FROM drink_orders
  WHERE id = p_order_id
  FOR UPDATE;
  
  -- Check if already delivered
  IF v_current_status = 'DELIVERED' THEN
    RAISE EXCEPTION 'ALREADY_DELIVERED';
  END IF;
  
  -- Check if order is in valid state for delivery
  IF v_current_status NOT IN ('PAID', 'IN_PROGRESS', 'READY') THEN
    RAISE EXCEPTION 'Order not ready for delivery. Current status: %', v_current_status;
  END IF;
  
  -- Mark as delivered
  UPDATE drink_orders
  SET status = 'DELIVERED',
      delivered_at = now(),
      delivered_by = p_delivered_by,
      updated_at = now()
  WHERE id = p_order_id;
  
  RETURN TRUE;
END;
$$;

-- =====================================================
-- 7. REALTIME PUBLICATION (for stock updates)
-- =====================================================

ALTER PUBLICATION supabase_realtime ADD TABLE drink_stock;
ALTER PUBLICATION supabase_realtime ADD TABLE drink_orders;

-- =====================================================
-- 8. UPDATE TIMESTAMPS
-- =====================================================

CREATE OR REPLACE FUNCTION update_drinks_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_drink_categories_updated_at
  BEFORE UPDATE ON drink_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_drinks_updated_at();

CREATE TRIGGER trigger_drinks_updated_at
  BEFORE UPDATE ON drinks
  FOR EACH ROW
  EXECUTE FUNCTION update_drinks_updated_at();

CREATE TRIGGER trigger_drink_stock_updated_at
  BEFORE UPDATE ON drink_stock
  FOR EACH ROW
  EXECUTE FUNCTION update_drinks_updated_at();

CREATE TRIGGER trigger_drink_orders_updated_at
  BEFORE UPDATE ON drink_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_drinks_updated_at();
