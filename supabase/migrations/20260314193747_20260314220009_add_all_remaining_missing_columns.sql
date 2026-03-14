/*
  # Add all remaining missing columns across tables

  ## Problem
  Edge functions reference many columns that don't exist in the database.
  These cause silent failures in payment flow, ticket creation, check-in, etc.

  ## Changes

  ### orders table
  - billing_street, billing_number, billing_postal_code, billing_city, billing_country
  - idempotency_key (for idempotent payment creation)
  - refund_protection (boolean, buyer opted in to refund protection)
  - refund_protection_fee_cents (fee paid for refund protection)
  - product_type (ticket/table/drink)
  - assigned_table_id (for table bookings linked to orders)
  - created_by_admin_id (for comped/guest orders)
  - persons_count (for multi-person guest orders)
  - send_mode (email/whatsapp/etc)
  - email_error (last email error message)

  ### tickets table
  - assigned_table_id (which table this ticket is assigned to)
  - table_note (special note for table assignment)
  - product_type (ticket/table)
  - public_token (public-facing token for ticket view URL)
  - terms_accepted, terms_accepted_at, terms_version, terms_language

  ### table_bookings table
  - checked_in_at (when guest checked in)
  - checked_in_by (who did the check-in)
  - check_in_count (number of times checked in)
  - table_note (special note for this booking)

  ### floorplan_tables table
  - table_name (display name for the table, different from table_number)
*/

-- orders: billing address and extra fields
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'billing_street') THEN
    ALTER TABLE public.orders ADD COLUMN billing_street text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'billing_number') THEN
    ALTER TABLE public.orders ADD COLUMN billing_number text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'billing_postal_code') THEN
    ALTER TABLE public.orders ADD COLUMN billing_postal_code text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'billing_city') THEN
    ALTER TABLE public.orders ADD COLUMN billing_city text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'billing_country') THEN
    ALTER TABLE public.orders ADD COLUMN billing_country text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'idempotency_key') THEN
    ALTER TABLE public.orders ADD COLUMN idempotency_key text UNIQUE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'refund_protection') THEN
    ALTER TABLE public.orders ADD COLUMN refund_protection boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'refund_protection_fee_cents') THEN
    ALTER TABLE public.orders ADD COLUMN refund_protection_fee_cents integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'product_type') THEN
    ALTER TABLE public.orders ADD COLUMN product_type text DEFAULT 'ticket';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'assigned_table_id') THEN
    ALTER TABLE public.orders ADD COLUMN assigned_table_id uuid REFERENCES public.floorplan_tables(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'created_by_admin_id') THEN
    ALTER TABLE public.orders ADD COLUMN created_by_admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'persons_count') THEN
    ALTER TABLE public.orders ADD COLUMN persons_count integer DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'send_mode') THEN
    ALTER TABLE public.orders ADD COLUMN send_mode text DEFAULT 'email';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'email_error') THEN
    ALTER TABLE public.orders ADD COLUMN email_error text;
  END IF;
END $$;

-- tickets: extra fields
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'assigned_table_id') THEN
    ALTER TABLE public.tickets ADD COLUMN assigned_table_id uuid REFERENCES public.floorplan_tables(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'table_note') THEN
    ALTER TABLE public.tickets ADD COLUMN table_note text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'product_type') THEN
    ALTER TABLE public.tickets ADD COLUMN product_type text DEFAULT 'ticket';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'public_token') THEN
    ALTER TABLE public.tickets ADD COLUMN public_token text UNIQUE DEFAULT encode(extensions.gen_random_bytes(16), 'hex');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'terms_accepted') THEN
    ALTER TABLE public.tickets ADD COLUMN terms_accepted boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'terms_accepted_at') THEN
    ALTER TABLE public.tickets ADD COLUMN terms_accepted_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'terms_version') THEN
    ALTER TABLE public.tickets ADD COLUMN terms_version text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'terms_language') THEN
    ALTER TABLE public.tickets ADD COLUMN terms_language text;
  END IF;
END $$;

-- table_bookings: check-in and note fields
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'table_bookings' AND column_name = 'checked_in_at') THEN
    ALTER TABLE public.table_bookings ADD COLUMN checked_in_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'table_bookings' AND column_name = 'checked_in_by') THEN
    ALTER TABLE public.table_bookings ADD COLUMN checked_in_by text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'table_bookings' AND column_name = 'check_in_count') THEN
    ALTER TABLE public.table_bookings ADD COLUMN check_in_count integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'table_bookings' AND column_name = 'table_note') THEN
    ALTER TABLE public.table_bookings ADD COLUMN table_note text;
  END IF;
END $$;

-- floorplan_tables: display name
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'floorplan_tables' AND column_name = 'table_name') THEN
    ALTER TABLE public.floorplan_tables ADD COLUMN table_name text;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
