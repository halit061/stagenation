/*
  # Create admin_otp_codes, refund_protection_config, refund_claims tables

  ## Purpose
  These tables support OTP authentication for admins and the refund protection
  feature for ticket purchases.

  ## New Tables

  ### admin_otp_codes
  - Time-limited one-time passwords for admin actions
  - Used by the admin-otp edge function

  ### refund_protection_config
  - Per-event configuration for refund protection fees
  - Controls whether buyers are offered refund protection at checkout

  ### refund_claims
  - Claims submitted by buyers requesting refunds
  - Linked to orders for tracking and processing
*/

-- admin_otp_codes
CREATE TABLE IF NOT EXISTS public.admin_otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  code text NOT NULL,
  purpose text DEFAULT 'admin_action',
  used boolean DEFAULT false,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.admin_otp_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own OTP codes"
  ON public.admin_otp_codes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own OTP codes"
  ON public.admin_otp_codes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own OTP codes"
  ON public.admin_otp_codes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- refund_protection_config
CREATE TABLE IF NOT EXISTS public.refund_protection_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid UNIQUE REFERENCES public.events(id) ON DELETE CASCADE,
  is_enabled boolean DEFAULT false,
  fee_type text DEFAULT 'percentage' CHECK (fee_type IN ('percentage', 'fixed')),
  fee_value integer DEFAULT 0,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.refund_protection_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view refund protection config"
  ON public.refund_protection_config FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins can insert refund protection config"
  ON public.refund_protection_config FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can update refund protection config"
  ON public.refund_protection_config FOR UPDATE
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

-- refund_claims
CREATE TABLE IF NOT EXISTS public.refund_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  claimant_name text NOT NULL,
  claimant_email text NOT NULL,
  reason text,
  evidence_urls jsonb DEFAULT '[]',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  reviewed_by text,
  reviewer_notes text,
  refund_amount integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.refund_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view refund claims"
  ON public.refund_claims FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can insert refund claims"
  ON public.refund_claims FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND is_active = true
    )
  );

CREATE POLICY "Admins can update refund claims"
  ON public.refund_claims FOR UPDATE
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_admin_otp_codes_user_id ON public.admin_otp_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_otp_codes_expires_at ON public.admin_otp_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_refund_protection_event_id ON public.refund_protection_config(event_id);
CREATE INDEX IF NOT EXISTS idx_refund_claims_event_id ON public.refund_claims(event_id);
CREATE INDEX IF NOT EXISTS idx_refund_claims_order_id ON public.refund_claims(order_id);

NOTIFY pgrst, 'reload schema';
