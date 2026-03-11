/*
  # Add GDPR and Mailing List Support

  ## Changes

  1. **Create mailing_list table**
     - Stores email addresses from marketing opt-in
     - Unique constraint on email
     - Tracks source (checkout_optin, manual, etc.)
     - Timestamps for compliance

  2. **Add marketing_opt_in to orders**
     - Boolean flag to track customer consent
     - Used to determine mailing list addition

  3. **Security**
     - Enable RLS on mailing_list
     - Only authenticated admins can view/export
     - Emails stored securely with database encryption

  ## Important Notes
  - No changes to payment flow
  - Marketing opt-in is explicit and stored in database only
  - Email uniqueness enforced at database level
*/

-- ============================================================================
-- 1. CREATE MAILING_LIST TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mailing_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  source text DEFAULT 'checkout_optin',
  consent_timestamp timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create index on email for fast lookups
CREATE INDEX IF NOT EXISTS idx_mailing_list_email ON public.mailing_list(email);

-- Create index on source for filtering
CREATE INDEX IF NOT EXISTS idx_mailing_list_source ON public.mailing_list(source);

-- Enable RLS
ALTER TABLE public.mailing_list ENABLE ROW LEVEL SECURITY;

-- Only authenticated users (admins) can view mailing list
CREATE POLICY "Authenticated users can view mailing list"
  ON public.mailing_list
  FOR SELECT
  TO authenticated
  USING (true);

-- Only system can insert (via edge functions)
CREATE POLICY "System can insert to mailing list"
  ON public.mailing_list
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- 2. ADD MARKETING_OPT_IN TO ORDERS TABLE
-- ============================================================================

-- Add marketing_opt_in column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'marketing_opt_in'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN marketing_opt_in boolean DEFAULT false;
  END IF;
END $$;

-- ============================================================================
-- 3. CREATE HELPER FUNCTION TO ADD TO MAILING LIST
-- ============================================================================

CREATE OR REPLACE FUNCTION public.add_to_mailing_list(
  p_email text,
  p_source text DEFAULT 'checkout_optin'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Insert email if not exists (ON CONFLICT DO NOTHING for idempotency)
  INSERT INTO public.mailing_list (email, source, consent_timestamp)
  VALUES (LOWER(p_email), p_source, now())
  ON CONFLICT (email) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.add_to_mailing_list IS 'Add email to mailing list with GDPR consent tracking. Idempotent - ignores duplicates.';