/*
  # Add missing columns to existing tables

  ## Problem
  Multiple columns referenced in the codebase and edge functions are missing
  from their respective tables, causing runtime errors.

  ## Changes

  ### floorplan_tables
  - `manual_status` (text) - manually override table status (AVAILABLE/SOLD/RESERVED)

  ### table_bookings
  - `paid_at` (timestamptz) - when the booking was paid
  - `qr_payload` (text) - QR code payload data (signed JWT or similar)
  - `qr_code` (text) - QR code image data URL or URL

  ### tickets
  - `scan_status` (text) - scanning status (scanned/unscanned)
*/

-- floorplan_tables: manual_status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'floorplan_tables' AND column_name = 'manual_status') THEN
    ALTER TABLE public.floorplan_tables ADD COLUMN manual_status text DEFAULT 'AVAILABLE' CHECK (manual_status IN ('AVAILABLE', 'SOLD', 'RESERVED'));
  END IF;
END $$;

-- table_bookings: paid_at, qr_payload, qr_code
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'table_bookings' AND column_name = 'paid_at') THEN
    ALTER TABLE public.table_bookings ADD COLUMN paid_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'table_bookings' AND column_name = 'qr_payload') THEN
    ALTER TABLE public.table_bookings ADD COLUMN qr_payload text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'table_bookings' AND column_name = 'qr_code') THEN
    ALTER TABLE public.table_bookings ADD COLUMN qr_code text;
  END IF;
END $$;

-- tickets: scan_status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'scan_status') THEN
    ALTER TABLE public.tickets ADD COLUMN scan_status text DEFAULT 'unscanned' CHECK (scan_status IN ('unscanned', 'scanned'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
