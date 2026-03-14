/*
  # Fix orders status constraint and add missing columns

  ## Problems
  1. orders.status constraint doesn't allow 'comped', 'hold_expired', 'reserved'
     which are used throughout edge functions
  2. orders.expires_at column missing (used in mollie-webhook and reserve-tickets)
  3. orders.reserved_items column missing (legacy hold system in mollie-webhook)
  4. ticket_types.quantity_reserved column missing (used in mollie-webhook)

  ## Fixes
*/

-- Fix orders status constraint to allow all used values
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'paid'::text,
    'failed'::text,
    'refunded'::text,
    'cancelled'::text,
    'comped'::text,
    'hold_expired'::text,
    'reserved'::text
  ]));

-- Add missing columns to orders
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'expires_at') THEN
    ALTER TABLE public.orders ADD COLUMN expires_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'reserved_items') THEN
    ALTER TABLE public.orders ADD COLUMN reserved_items jsonb DEFAULT '[]';
  END IF;
END $$;

-- Add missing columns to ticket_types
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ticket_types' AND column_name = 'quantity_reserved') THEN
    ALTER TABLE public.ticket_types ADD COLUMN quantity_reserved integer DEFAULT 0;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
