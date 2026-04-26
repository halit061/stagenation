/*
  # Pre-Live Security Hardening (K1, K2, K3)

  Critical security fixes before switching Mollie from test to live key.

  1. K1 - Orders RLS leak fix
     - Replace "Users can view own orders" policy that contained
       `OR auth.uid() IS NOT NULL` (allowed any logged-in user to read ALL orders)
     - New policy restricts to payer_email match against JWT email only
     - Existing admin policies and session-owner policies are kept intact

  2. K2 - Seat holds anon policy hardening
     - Old policy "Anon can update own session holds" only checked
       `session_id IS NOT NULL`, allowing any anon caller to hijack holds
     - New policy requires the session_id column to match the
       `x-session-id` header sent by the client
     - Same scope tightening applied to anon SELECT policy

  3. K3 - Webhook idempotency unique index
     - Adds a partial UNIQUE index on webhook_logs(provider, event_type)
     - Excludes diagnostic event types ('invalid_payment_id',
       'amount_mismatch') which are intentionally non-unique
     - This makes the existing onConflict idempotency lock in
       mollie-webhook actually enforceable, preventing double processing
       of Mollie webhook retries

  ## Notes

  1. No data is deleted - only policies are replaced and an index is added.
  2. Database currently has 0 orders so K1/K2 changes have no row-level impact.
  3. K3 verified: no duplicate (provider, event_type) rows exist today.
*/

-- ============================================================
-- K1: Fix orders RLS leak
-- ============================================================
DROP POLICY IF EXISTS "Users can view own orders" ON orders;

CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT
  TO authenticated
  USING (
    payer_email = (
      SELECT (current_setting('request.jwt.claims', true)::json ->> 'email')
    )
  );

-- ============================================================
-- K2: Tighten anon seat_holds policies to match session header
-- ============================================================
DROP POLICY IF EXISTS "Anon can update own session holds" ON seat_holds;
DROP POLICY IF EXISTS "Anon can read own session holds" ON seat_holds;

CREATE POLICY "Anon can read own session holds"
  ON seat_holds FOR SELECT
  TO anon
  USING (
    session_id IS NOT NULL
    AND session_id = (
      current_setting('request.headers', true)::json ->> 'x-session-id'
    )
  );

CREATE POLICY "Anon can update own session holds"
  ON seat_holds FOR UPDATE
  TO anon
  USING (
    session_id IS NOT NULL
    AND session_id = (
      current_setting('request.headers', true)::json ->> 'x-session-id'
    )
  )
  WITH CHECK (
    session_id IS NOT NULL
    AND session_id = (
      current_setting('request.headers', true)::json ->> 'x-session-id'
    )
  );

-- ============================================================
-- K3: Webhook idempotency unique index (partial)
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_logs_provider_event_unique
  ON webhook_logs (provider, event_type)
  WHERE event_type NOT IN ('invalid_payment_id', 'amount_mismatch');
