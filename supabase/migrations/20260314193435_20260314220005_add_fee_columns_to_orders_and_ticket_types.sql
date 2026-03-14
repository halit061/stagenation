/*
  # Add fee tracking columns to orders and ticket_types

  ## Problem
  SuperAdmin.tsx queries for fee columns on orders that don't exist,
  and Tickets.tsx queries for service fee columns on ticket_types that don't exist.

  ## Changes

  ### orders table
  - `service_fee_total_cents` (integer) - total service fees charged
  - `platform_fee_total_cents` (integer) - platform/processing fee
  - `provider_fee_total_cents` (integer) - payment provider fee (Mollie etc.)
  - `net_revenue_cents` (integer) - revenue after all fees

  ### ticket_types table
  - `service_fee_mode` (text) - how service fee is calculated: none/fixed/percent
  - `service_fee_fixed` (integer) - fixed fee amount in cents
  - `service_fee_percent` (numeric) - percentage fee (e.g., 5.5 = 5.5%)
  - `entrance_id` (uuid) - which entrance this ticket type is associated with
*/

-- orders: fee tracking columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'service_fee_total_cents') THEN
    ALTER TABLE public.orders ADD COLUMN service_fee_total_cents integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'platform_fee_total_cents') THEN
    ALTER TABLE public.orders ADD COLUMN platform_fee_total_cents integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'provider_fee_total_cents') THEN
    ALTER TABLE public.orders ADD COLUMN provider_fee_total_cents integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'net_revenue_cents') THEN
    ALTER TABLE public.orders ADD COLUMN net_revenue_cents integer DEFAULT 0;
  END IF;
END $$;

-- ticket_types: service fee columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ticket_types' AND column_name = 'service_fee_mode') THEN
    ALTER TABLE public.ticket_types ADD COLUMN service_fee_mode text DEFAULT 'none' CHECK (service_fee_mode IN ('none', 'fixed', 'percent'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ticket_types' AND column_name = 'service_fee_fixed') THEN
    ALTER TABLE public.ticket_types ADD COLUMN service_fee_fixed integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ticket_types' AND column_name = 'service_fee_percent') THEN
    ALTER TABLE public.ticket_types ADD COLUMN service_fee_percent numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ticket_types' AND column_name = 'entrance_id') THEN
    ALTER TABLE public.ticket_types ADD COLUMN entrance_id uuid REFERENCES public.entrances(id) ON DELETE SET NULL;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
