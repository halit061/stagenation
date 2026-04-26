import { createClient } from 'npm:@supabase/supabase-js@2';
import { Resend } from 'npm:resend@4.0.0';
import { getCorsHeaders } from "../_shared/cors.ts";

interface RequestBody {
  email: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<void> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const emailFrom = Deno.env.get('EMAIL_FROM') || 'StageNation <noreply@lumetrix.be>';

  if (!resendApiKey) {
    throw new Error('Email service not configured');
  }

  const resend = new Resend(resendApiKey);

  const result = await resend.emails.send({
    from: emailFrom,
    to: [to],
    reply_to: 'tickets@stagenation.be',
    subject,
    html,
  });

  if (result?.error) {
    throw new Error(`Resend API error: ${result.error.message || JSON.stringify(result.error)}`);
  }
}

function buildEmailHtml(resetLink: string): string {
  return `<!DOCTYPE html>
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
      Er is een verzoek ingediend om je wachtwoord te resetten voor je StageNation account.
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
      StageNation - Event Management
    </p>
  </div>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json().catch(() => ({ email: '' }));
    const email = (body.email || '').trim().toLowerCase();

    if (!email || !EMAIL_RE.test(email) || email.length > 320) {
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const siteUrl = Deno.env.get('SITE_URL') || 'https://stagenation.be';

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: `${siteUrl}/superadmin-reset`,
      },
    });

    if (linkError) {
      const msg = (linkError.message || '').toLowerCase();
      if (msg.includes('not found') || msg.includes('no user')) {
        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.error('[request-password-reset] generateLink error:', linkError);
      return new Response(
        JSON.stringify({ success: false, error: 'Could not generate reset link' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resetLink = linkData?.properties?.action_link;
    if (!resetLink) {
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await sendEmail({
      to: email,
      subject: 'Wachtwoord Resetten - StageNation',
      html: buildEmailHtml(resetLink),
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[request-password-reset] Unexpected error:', error?.message || error);
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
