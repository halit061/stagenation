import { createClient } from 'npm:@supabase/supabase-js@2';
import { Resend } from 'npm:resend@4.0.0';
import { getCorsHeaders } from "../_shared/cors.ts";

interface SendPasswordResetRequest {
  user_id: string;
  email: string;
}

async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<{ id: string }> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const emailFrom = Deno.env.get('EMAIL_FROM') || 'Eskiler <noreply@lumetrix.be>';

  if (!resendApiKey) {
    throw new Error('Email service not configured - RESEND_API_KEY missing');
  }

  const resend = new Resend(resendApiKey);

  const result = await resend.emails.send({
    from: emailFrom,
    to: [to],
    reply_to: 'info@bizimevents.be',
    subject,
    html,
  });

  if (result?.error) {
    throw new Error(`Resend API error: ${result.error.message || JSON.stringify(result.error)}`);
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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: requestingUser }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !requestingUser) {
      throw new Error('Unauthorized');
    }

    const { data: requesterRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .eq('is_active', true);

    const isSuperAdmin = requesterRoles?.some(r => r.role === 'super_admin' || r.role === 'superadmin');
    const isAdmin = requesterRoles?.some(r => r.role === 'admin');

    if (!isSuperAdmin && !isAdmin) {
      throw new Error('Only super admins or admins can send password reset emails');
    }

    const body: SendPasswordResetRequest = await req.json();
    const { user_id, email } = body;

    if (!user_id || !email) {
      throw new Error('user_id and email are required');
    }

    const siteUrl = Deno.env.get('SITE_URL') || 'https://bizimevents.be';

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: `${siteUrl}/#superadmin`,
      },
    });

    if (linkError) {
      console.error('[RESET] Error generating link:', linkError);
      throw new Error(`Failed to generate reset link: ${linkError.message}`);
    }

    const resetLink = linkData?.properties?.action_link;
    if (!resetLink) {
      throw new Error('No reset link generated');
    }

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wachtwoord Resetten</title>
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background-color: #1a1a2e; padding: 30px; border-radius: 10px;">
    <h1 style="color: #ffffff; margin-bottom: 20px;">Wachtwoord Resetten</h1>
    <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6;">
      Er is een verzoek ingediend om je wachtwoord te resetten voor je Eskiler account.
    </p>
    <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6;">
      Klik op de onderstaande knop om een nieuw wachtwoord in te stellen:
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetLink}" style="display: inline-block; background-color: #ef4444; color: #ffffff; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
        Wachtwoord Resetten
      </a>
    </div>
    <p style="color: #a0a0a0; font-size: 14px; line-height: 1.6;">
      Als je dit verzoek niet hebt gedaan, kun je deze email negeren.
    </p>
    <p style="color: #a0a0a0; font-size: 14px; line-height: 1.6;">
      Deze link is 24 uur geldig.
    </p>
    <hr style="border: none; border-top: 1px solid #333; margin: 30px 0;">
    <p style="color: #666; font-size: 12px; text-align: center;">
      Eskiler - Event Management
    </p>
  </div>
</body>
</html>
`;

    const emailResult = await sendEmail({
      to: email,
      subject: 'Wachtwoord Resetten - Eskiler',
      html: emailHtml,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Password reset email sent successfully',
        email_id: emailResult.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in send-password-reset-email:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
