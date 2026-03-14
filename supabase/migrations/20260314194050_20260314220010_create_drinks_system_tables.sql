/*
  # Create drinks system tables

  ## Purpose
  The BarOrders, DrinksMenu pages and create-drink-order/deliver-drink-order
  edge functions require these tables for the drinks ordering system.

  ## New Tables

  ### drink_categories
  - Categories for drinks (beer, wine, cocktails, etc.)
  - Supports multilingual names (nl/tr)

  ### drinks
  - Individual drink items with price and stock tracking
  - Linked to categories

  ### drink_stock
  - Per-event stock tracking for drinks
  - Can be depleted as orders are placed

  ### drink_orders
  - Customer drink orders with fulfillment tracking
  - Can be DELIVERY (to table) or PICKUP (from bar)
  - Status: PENDING_PAYMENT -> PAID -> IN_PROGRESS -> READY -> DELIVERED

  ### drink_order_items
  - Line items for each drink order
*/

-- drink_categories
CREATE TABLE IF NOT EXISTS public.drink_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_nl text,
  name_tr text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.drink_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active drink categories"
  ON public.drink_categories FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "Admins can view all drink categories"
  ON public.drink_categories FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can insert drink categories"
  ON public.drink_categories FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can update drink categories"
  ON public.drink_categories FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can delete drink categories"
  ON public.drink_categories FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

-- drinks
CREATE TABLE IF NOT EXISTS public.drinks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.drink_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  name_nl text,
  name_tr text,
  description text,
  price integer NOT NULL DEFAULT 0,
  sku text,
  image_url text,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.drinks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active drinks"
  ON public.drinks FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "Admins can view all drinks"
  ON public.drinks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can insert drinks"
  ON public.drinks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can update drinks"
  ON public.drinks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can delete drinks"
  ON public.drinks FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

-- drink_stock
CREATE TABLE IF NOT EXISTS public.drink_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drink_id uuid NOT NULL REFERENCES public.drinks(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  stock_total integer DEFAULT 0,
  stock_current integer DEFAULT 0,
  stock_reserved integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (drink_id, event_id)
);

ALTER TABLE public.drink_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view drink stock"
  ON public.drink_stock FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins can insert drink stock"
  ON public.drink_stock FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can update drink stock"
  ON public.drink_stock FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

-- drink_orders
CREATE TABLE IF NOT EXISTS public.drink_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  table_booking_id uuid REFERENCES public.table_bookings(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  display_code text UNIQUE DEFAULT upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  status text NOT NULL DEFAULT 'PENDING_PAYMENT' CHECK (status IN ('PENDING_PAYMENT', 'PAID', 'IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELLED')),
  fulfillment_type text NOT NULL DEFAULT 'PICKUP' CHECK (fulfillment_type IN ('DELIVERY', 'PICKUP')),
  pickup_bar text,
  total_amount integer NOT NULL DEFAULT 0,
  customer_name text,
  customer_email text,
  payment_id text,
  paid_at timestamptz,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.drink_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view drink orders"
  ON public.drink_orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin', 'scanner')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can insert drink orders"
  ON public.drink_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can update drink orders"
  ON public.drink_orders FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin', 'scanner')
      AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin', 'scanner')
      AND is_active = true
    )
  );

-- drink_order_items
CREATE TABLE IF NOT EXISTS public.drink_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drink_order_id uuid NOT NULL REFERENCES public.drink_orders(id) ON DELETE CASCADE,
  drink_id uuid NOT NULL REFERENCES public.drinks(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.drink_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view drink order items"
  ON public.drink_order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin', 'scanner')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can insert drink order items"
  ON public.drink_order_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_drinks_category_id ON public.drinks(category_id);
CREATE INDEX IF NOT EXISTS idx_drink_stock_event_id ON public.drink_stock(event_id);
CREATE INDEX IF NOT EXISTS idx_drink_stock_drink_id ON public.drink_stock(drink_id);
CREATE INDEX IF NOT EXISTS idx_drink_orders_event_id ON public.drink_orders(event_id);
CREATE INDEX IF NOT EXISTS idx_drink_orders_status ON public.drink_orders(status);
CREATE INDEX IF NOT EXISTS idx_drink_order_items_order_id ON public.drink_order_items(drink_order_id);

NOTIFY pgrst, 'reload schema';
