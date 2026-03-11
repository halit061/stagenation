/*
  # Add order_id column to table_guests table

  1. Changes
    - Add `order_id` column to `table_guests` table for linking to orders
    - Add foreign key constraint to orders table
    - Add index for faster lookups

  2. Purpose
    - Allows tracking which order a table guest belongs to
    - Enables showing order_number in the UI
    - Supports resend/delete functionality via ticket system
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'table_guests' AND column_name = 'order_id'
  ) THEN
    ALTER TABLE public.table_guests ADD COLUMN order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_table_guests_order_id ON public.table_guests(order_id);
CREATE INDEX IF NOT EXISTS idx_table_guests_ticket_id ON public.table_guests(ticket_id);
