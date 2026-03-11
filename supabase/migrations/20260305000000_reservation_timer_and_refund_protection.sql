/*
  # Reservation Timer + Refund Protection

  1. New Functions
    - `convert_reservation_to_sold` - transfers quantity_reserved -> quantity_sold
      when a reserved order proceeds to payment

  2. New Tables
    - `refund_protection_config` - per-event configuration for refund protection
    - `refund_claims` - tracks refund claim requests

  3. Modified Tables
    - `orders` - add refund_protection flag and fee columns

  4. Security
    - RLS enabled on both new tables
    - Config readable by anyone (needed for checkout), writable by authenticated
    - Claims insertable by anyone, manageable by authenticated
*/

-- ============================================================
-- FEATURE 1: Reservation Timer - convert_reservation_to_sold
-- ============================================================

CREATE OR REPLACE FUNCTION public.convert_reservation_to_sold(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_item jsonb;
  v_tt_id uuid;
  v_qty integer;
BEGIN
  -- Fetch and lock the order
  SELECT id, event_id, reserved_items, status, expires_at
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  IF v_order.status != 'reserved' THEN
    RAISE EXCEPTION 'Order is not in reserved status: %', v_order.status;
  END IF;

  -- Check if reservation has expired
  IF v_order.expires_at IS NOT NULL AND v_order.expires_at < now() THEN
    RAISE EXCEPTION 'Reservation has expired for order: %', p_order_id;
  END IF;

  IF v_order.reserved_items IS NULL THEN
    RAISE EXCEPTION 'No reserved items found for order: %', p_order_id;
  END IF;

  -- Transfer each item from reserved to sold
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_order.reserved_items)
  LOOP
    v_tt_id := (v_item->>'ticket_type_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;

    UPDATE public.ticket_types
    SET quantity_reserved = GREATEST(0, quantity_reserved - v_qty),
        quantity_sold = quantity_sold + v_qty
    WHERE id = v_tt_id
      AND event_id = v_order.event_id;
  END LOOP;

  -- Update order status from reserved to pending (ready for payment)
  UPDATE public.orders
  SET status = 'pending',
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id);
END;
$$;

-- ============================================================
-- SHARED: Atomic promo code increment (prevents race conditions)
-- ============================================================

CREATE OR REPLACE FUNCTION public.increment_promo_usage(
  p_promo_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.promo_codes
  SET used_count = COALESCE(used_count, 0) + 1
  WHERE id = p_promo_id;
END;
$$;

-- ============================================================
-- FEATURE 2: Refund Protection
-- ============================================================

-- 1. Refund protection configuration per event
CREATE TABLE IF NOT EXISTS public.refund_protection_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  fee_type text NOT NULL DEFAULT 'percentage' CHECK (fee_type IN ('percentage', 'fixed')),
  fee_value numeric(10,2) NOT NULL DEFAULT 5.00,
  description_nl text DEFAULT 'Bescherm je boeking tegen onverwachte annulering',
  description_tr text DEFAULT 'Rezervasyonunuzu beklenmedik iptallere karşı koruyun',
  description_fr text DEFAULT 'Protégez votre réservation contre une annulation imprévue',
  description_de text DEFAULT 'Schützen Sie Ihre Buchung vor unerwarteter Stornierung',
  terms_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_event_refund_config UNIQUE (event_id),
  CONSTRAINT check_fee_value_positive CHECK (fee_value > 0),
  CONSTRAINT check_fee_value_reasonable CHECK (
    (fee_type = 'percentage' AND fee_value BETWEEN 1 AND 25) OR
    (fee_type = 'fixed' AND fee_value BETWEEN 0.50 AND 50.00)
  )
);

-- 2. Refund claims tracking
CREATE TABLE IF NOT EXISTS public.refund_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  claimant_email text NOT NULL,
  claimant_name text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  evidence_url text,
  admin_notes text,
  refund_amount_cents integer DEFAULT 0,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Add refund protection columns to orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'refund_protection'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN refund_protection boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'refund_protection_fee_cents'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN refund_protection_fee_cents integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_refund_protection_config_event_id
  ON public.refund_protection_config(event_id);

CREATE INDEX IF NOT EXISTS idx_refund_claims_order_id
  ON public.refund_claims(order_id);

CREATE INDEX IF NOT EXISTS idx_refund_claims_event_id_status
  ON public.refund_claims(event_id, status);

-- 5. RLS
ALTER TABLE public.refund_protection_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_claims ENABLE ROW LEVEL SECURITY;

-- Config: anyone can read (needed for checkout page), authenticated admins can manage
CREATE POLICY "Anyone can view refund protection config"
  ON public.refund_protection_config FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage refund protection config"
  ON public.refund_protection_config FOR ALL
  TO authenticated
  USING (is_admin_or_super())
  WITH CHECK (is_admin_or_super());

-- Claims: anyone can insert (for submitting claims), admins can view and manage
CREATE POLICY "Anyone can create refund claims"
  ON public.refund_claims FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view refund claims"
  ON public.refund_claims FOR SELECT
  TO authenticated
  USING (is_admin_or_super());

CREATE POLICY "Admins can update refund claims"
  ON public.refund_claims FOR UPDATE
  TO authenticated
  USING (is_admin_or_super())
  WITH CHECK (is_admin_or_super());

-- 6. Updated_at triggers (use existing function if available)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE TRIGGER update_refund_protection_config_updated_at
      BEFORE UPDATE ON public.refund_protection_config
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    CREATE TRIGGER update_refund_claims_updated_at
      BEFORE UPDATE ON public.refund_claims
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- triggers already exist
END $$;
