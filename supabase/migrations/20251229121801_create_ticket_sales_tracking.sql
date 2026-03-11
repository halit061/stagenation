/*
  # Create Ticket Sales Tracking System

  ## Overview
  Adds comprehensive ticket sales tracking for SuperAdmin reporting and CSV exports.
  Every successful ticket purchase will be stored here for analytics and record-keeping.

  ## New Tables

  ### ticket_orders
  Main order record for each ticket purchase:
  - id: Unique order identifier
  - event_id: Links to the event
  - order_id: External order/payment reference (unique)
  - buyer_name, buyer_email, buyer_phone: Customer details
  - quantity: Total tickets in order
  - subtotal_cents, fee_cents, total_cents: Pricing breakdown
  - currency: Payment currency (default EUR)
  - payment_provider: Payment processor (default mollie)
  - payment_status: Order status (paid/refunded/chargeback/cancelled)
  - created_at: Timestamp of order

  ### ticket_order_items
  Line items for each ticket type in an order:
  - id: Unique item identifier
  - ticket_order_id: Links to parent order
  - ticket_type_id: References ticket_types (nullable for history)
  - ticket_type_name: Snapshot of ticket type name at purchase time
  - unit_price_cents: Price per ticket
  - quantity: Number of tickets of this type
  - line_total_cents: Total for this line item

  ### v_ticket_sales_summary
  Aggregated view of sales per event for quick reporting

  ## Security
  - RLS enabled on all tables
  - SuperAdmin-only access (SELECT, INSERT, UPDATE, DELETE)
  - No public access to sales data

  ## Notes
  - Idempotent: Safe to run multiple times
  - Stores snapshot data so price/name changes don't affect history
  - Designed for analytics and CSV exports
*/

-- Create ticket_orders table
CREATE TABLE IF NOT EXISTS public.ticket_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  order_id text NOT NULL UNIQUE,
  buyer_name text,
  buyer_email text,
  buyer_phone text,
  quantity integer NOT NULL DEFAULT 1,
  subtotal_cents integer NOT NULL DEFAULT 0,
  fee_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  payment_provider text DEFAULT 'mollie',
  payment_status text NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('paid', 'refunded', 'chargeback', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create ticket_order_items table
CREATE TABLE IF NOT EXISTS public.ticket_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_order_id uuid NOT NULL REFERENCES public.ticket_orders(id) ON DELETE CASCADE,
  ticket_type_id uuid REFERENCES public.ticket_types(id) ON DELETE SET NULL,
  ticket_type_name text NOT NULL,
  unit_price_cents integer NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  line_total_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_ticket_orders_event_id ON public.ticket_orders(event_id);
CREATE INDEX IF NOT EXISTS idx_ticket_orders_order_id ON public.ticket_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_ticket_orders_created_at ON public.ticket_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_orders_buyer_email ON public.ticket_orders(buyer_email);
CREATE INDEX IF NOT EXISTS idx_ticket_order_items_ticket_order_id ON public.ticket_order_items(ticket_order_id);

-- Create aggregated view for sales summary per event
CREATE OR REPLACE VIEW public.v_ticket_sales_summary AS
SELECT
  e.id AS event_id,
  e.name AS event_name,
  COALESCE(e.start_date, e.event_start) AS event_date,
  COUNT(DISTINCT to_data.id) AS total_orders,
  COALESCE(SUM(to_data.quantity), 0) AS total_tickets,
  COALESCE(SUM(to_data.total_cents), 0) AS total_revenue_cents,
  MAX(to_data.created_at) AS last_order_at
FROM public.events e
LEFT JOIN public.ticket_orders to_data ON to_data.event_id = e.id
GROUP BY e.id, e.name, e.start_date, e.event_start;

-- Enable RLS on new tables
ALTER TABLE public.ticket_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_order_items ENABLE ROW LEVEL SECURITY;

-- SuperAdmin-only policies for ticket_orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ticket_orders'
    AND policyname = 'SuperAdmin full access to ticket orders'
  ) THEN
    CREATE POLICY "SuperAdmin full access to ticket orders"
      ON public.ticket_orders
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_roles.user_id = auth.uid()
          AND user_roles.role = 'superadmin'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_roles.user_id = auth.uid()
          AND user_roles.role = 'superadmin'
        )
      );
  END IF;
END $$;

-- SuperAdmin-only policies for ticket_order_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ticket_order_items'
    AND policyname = 'SuperAdmin full access to ticket order items'
  ) THEN
    CREATE POLICY "SuperAdmin full access to ticket order items"
      ON public.ticket_order_items
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_roles.user_id = auth.uid()
          AND user_roles.role = 'superadmin'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_roles.user_id = auth.uid()
          AND user_roles.role = 'superadmin'
        )
      );
  END IF;
END $$;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_order_items TO authenticated;
GRANT SELECT ON public.v_ticket_sales_summary TO authenticated;
