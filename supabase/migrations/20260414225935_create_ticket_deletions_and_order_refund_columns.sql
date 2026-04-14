/*
  # Ticket Deletions Tracking System

  1. New Tables
    - `ticket_deletions`
      - `id` (uuid, primary key)
      - `order_id` (uuid, references orders)
      - `event_id` (uuid, references events)
      - `order_number` (text) - snapshot of order number
      - `payer_name` (text) - snapshot of payer name
      - `payer_email` (text) - snapshot of payer email
      - `total_amount` (integer) - snapshot of total amount in cents
      - `ticket_count` (integer) - number of tickets deleted
      - `seat_count` (integer) - number of seat tickets deleted
      - `reason` (text) - reason category for deletion
      - `notes` (text) - optional free-text notes
      - `deleted_by` (uuid, references auth.users)
      - `deleted_at` (timestamptz) - when deletion occurred
      - `created_at` (timestamptz)

  2. Modified Tables
    - `orders`
      - `refunded_at` (timestamptz) - when the order was refunded/deleted
      - `refund_reason` (text) - reason category
      - `refund_notes` (text) - optional notes

  3. Security
    - Enable RLS on `ticket_deletions`
    - Only authenticated admins/superadmins can read/insert
*/

CREATE TABLE IF NOT EXISTS ticket_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  event_id uuid NOT NULL,
  order_number text NOT NULL DEFAULT '',
  payer_name text NOT NULL DEFAULT '',
  payer_email text NOT NULL DEFAULT '',
  total_amount integer NOT NULL DEFAULT 0,
  ticket_count integer NOT NULL DEFAULT 0,
  seat_count integer NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT '',
  notes text DEFAULT '',
  deleted_by uuid,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ticket_deletions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ticket deletions"
  ON ticket_deletions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('superadmin', 'super_admin', 'admin', 'organizer')
        AND user_roles.is_active = true
    )
  );

CREATE POLICY "Admins can insert ticket deletions"
  ON ticket_deletions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role IN ('superadmin', 'super_admin', 'admin', 'organizer')
        AND user_roles.is_active = true
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'refunded_at'
  ) THEN
    ALTER TABLE orders ADD COLUMN refunded_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'refund_reason'
  ) THEN
    ALTER TABLE orders ADD COLUMN refund_reason text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'refund_notes'
  ) THEN
    ALTER TABLE orders ADD COLUMN refund_notes text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ticket_deletions_event_id ON ticket_deletions(event_id);
CREATE INDEX IF NOT EXISTS idx_ticket_deletions_order_id ON ticket_deletions(order_id);
CREATE INDEX IF NOT EXISTS idx_ticket_deletions_deleted_at ON ticket_deletions(deleted_at DESC);
