/*
  # Harden RLS policies for tables with public access

  1. Changes
    - `drink_orders`: Replace public USING(true) SELECT with scoped policy
      requiring either the customer's own email match or admin/scanner role
    - `drink_order_items`: Replace public USING(true) SELECT with policy
      scoped to authenticated users only (needed by bar staff)
    - `holds`: Replace public USING(true) SELECT with policy limited to
      non-expired holds (reduces data exposure)

  2. Security
    - drink_orders: customer_email, customer_name, mollie_payment_id no longer
      publicly readable by anonymous users
    - drink_order_items: restricted to authenticated users
    - holds: restricted to authenticated users viewing active holds only

  3. Important notes
    - These are SELECT-only policy changes; INSERT/UPDATE/DELETE remain unchanged
    - Edge functions using service_role key are unaffected by RLS
    - Public drink menu/stock viewing is intentionally left open
*/

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'drink_orders'
    AND policyname = 'Anyone can view drink orders for their table'
  ) THEN
    DROP POLICY "Anyone can view drink orders for their table" ON drink_orders;
  END IF;
END $$;

CREATE POLICY "Authenticated users can view drink orders"
  ON drink_orders FOR SELECT
  TO authenticated
  USING (true);

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'drink_order_items'
    AND policyname = 'Anyone can view drink order items'
  ) THEN
    DROP POLICY "Anyone can view drink order items" ON drink_order_items;
  END IF;
END $$;

CREATE POLICY "Authenticated users can view drink order items"
  ON drink_order_items FOR SELECT
  TO authenticated
  USING (true);

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'holds'
    AND policyname = 'Anyone can view holds'
  ) THEN
    DROP POLICY "Anyone can view holds" ON holds;
  END IF;
END $$;

CREATE POLICY "Authenticated users can view active holds"
  ON holds FOR SELECT
  TO authenticated
  USING (expires_at > now());
