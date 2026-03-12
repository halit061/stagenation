import { createClient } from 'npm:@supabase/supabase-js@2';
import { Resend } from 'npm:resend@4.0.0';
import { getCorsHeaders, hasSuperAdminRole } from '../_shared/cors.ts';

interface OtpRequest {
  action: 'send' | 'verify';
  code?: string;
}

function generateOtpCode(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(array[0] % 1000000).padStart(6, '0');
}

async function sendOtpEmail(
  to: string,
  code: string
): Promise<{ id: string }> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const emailFrom =
    Deno.env.get('EMAIL_FROM') || 'StageNation <noreply@lumetrix.be>';

  if (!resendApiKey) {
    throw new Error('Email service not configured - RESEND_API_KEY missing');
  }

  const resend = new Resend(resendApiKey);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SuperAdmin Verificatie</title>
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background-color: #1a1a2e; padding: 30px; border-radius: 10px;">
    <h1 style="color: #ffffff; margin-bottom: 20px;">SuperAdmin Verificatie</h1>
    <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6;">
      Je verificatiecode voor SuperAdmin toegang:
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <div style="display: inline-block; background-color: #1e293b; border: 2px solid #ef4444; border-radius: 12px; padding: 20px 40px;">
        <span style="font-size: 36px; font-weight: bold; color: #ffffff; letter-spacing: 8px; font-family: monospace;">${code}</span>
      </div>
    </div>
    <p style="color: #a0a0a0; font-size: 14px; line-height: 1.6;">
      Deze code is 5 minuten geldig. Deel deze code met niemand.
    </p>
    <p style="color: #a0a0a0; font-size: 14px; line-height: 1.6;">
      Als je dit verzoek niet hebt gedaan, wijzig dan onmiddellijk je wachtwoord.
    </p>
    <hr style="border: none; border-top: 1px solid #333; margin: 30px 0;">
    <p style="color: #666; font-size: 12px; text-align: center;">
      StageNation - SuperAdmin Security
    </p>
  </div>
</body>
</html>`;

  const result = await resend.emails.send({
    from: emailFrom,
    to: [to],
    reply_to: 'tickets@stagenation.be',
    subject: 'SuperAdmin Verificatiecode - StageNation',
    html,
  });

  if (result?.error) {
    throw new Error(
      `Resend API error: ${result.error.message || JSON.stringify(result.error)}`
    );
  }

  const emailId = result?.data?.id || result?.id;
  if (!emailId) {
    throw new Error('Resend API returned no email ID');
  }

  return { id: emailId };
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header', code: 'NO_AUTH' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', code: 'INVALID_JWT' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify super_admin role
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (!hasSuperAdminRole(roles)) {
      return new Response(
        JSON.stringify({ error: 'SuperAdmin role required', code: 'FORBIDDEN' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: OtpRequest = await req.json();
    const { action } = body;

    if (action === 'send') {
      // Invalidate old unused codes for this user
      await supabase
        .from('admin_otp_codes')
        .update({ used: true })
        .eq('user_id', user.id)
        .eq('used', false);

      // Generate new code
      const code = generateOtpCode();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

      const { error: insertError } = await supabase
        .from('admin_otp_codes')
        .insert({
          user_id: user.id,
          code,
          expires_at: expiresAt,
        });

      if (insertError) {
        console.error('[OTP] Insert error:', insertError);
        throw new Error('Failed to create verification code');
      }

      // Send email
      const emailResult = await sendOtpEmail(user.email!, code);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Verification code sent',
          email_id: emailResult.id,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'verify') {
      const { code } = body;

      if (!code || code.length !== 6) {
        return new Response(
          JSON.stringify({ error: 'Valid 6-digit code required', code: 'INVALID_CODE' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check for too many failed attempts (codes generated but all used/expired)
      const { count: recentAttempts } = await supabase
        .from('admin_otp_codes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString());

      if (recentAttempts && recentAttempts > 10) {
        return new Response(
          JSON.stringify({
            error: 'Te veel pogingen. Wacht 15 minuten.',
            code: 'RATE_LIMITED',
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Find valid matching code
      const { data: validCodes } = await supabase
        .from('admin_otp_codes')
        .select('id, code')
        .eq('user_id', user.id)
        .eq('used', false)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1);

      if (!validCodes || validCodes.length === 0 || validCodes[0].code !== code) {
        return new Response(
          JSON.stringify({
            error: 'Ongeldige of verlopen code',
            code: 'CODE_INVALID',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Mark code as used
      await supabase
        .from('admin_otp_codes')
        .update({ used: true })
        .eq('id', validCodes[0].id);

      // Clean up old codes (older than 1 hour)
      await supabase
        .from('admin_otp_codes')
        .delete()
        .lt('expires_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

      return new Response(
        JSON.stringify({ success: true, verified: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use "send" or "verify".' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[admin-otp] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
