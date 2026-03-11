-- Admin OTP verification codes for SuperAdmin access
CREATE TABLE IF NOT EXISTS admin_otp_codes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_admin_otp_expires ON admin_otp_codes(expires_at);
CREATE INDEX idx_admin_otp_user ON admin_otp_codes(user_id);

-- RLS: No client-side policies — only service_role can access
ALTER TABLE admin_otp_codes ENABLE ROW LEVEL SECURITY;
