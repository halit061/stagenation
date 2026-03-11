import { createClient } from 'npm:@supabase/supabase-js@2';
import { Resend } from 'npm:resend@4.0.0';
import { getCorsHeaders } from "../_shared/cors.ts";

interface ResendRequest {
  table_guest_id: string;
}

async function generateQRCode(data: string): Promise<string> {
  try {
    const QRCodeModule = await import('npm:qrcode@1.5.3');
    const QRCode = QRCodeModule.default || QRCodeModule;
    return await QRCode.toDataURL(data, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });
  } catch (err) {
    console.error('QR Code generation failed:', err);
    return '';
  }
}

async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<{ id: string | null; error: string | null }> {
  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const emailFrom = Deno.env.get('EMAIL_FROM') || 'Eskiler Tickets <tickets@lumetrix.be>';

    if (!resendApiKey) {
      return { id: null, error: 'Email service not configured' };
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
      return { id: null, error: result.error.message || 'Resend API error' };
    }

    const emailId = result?.data?.id || result?.id;
    if (!emailId) {
      return { id: null, error: 'No email ID returned' };
    }

    return { id: emailId, error: null };
  } catch (error) {
    return { id: null, error: error.message };
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('nl-BE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Europe/Brussels',
  });
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('nl-BE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Brussels',
  });
}

function buildTableGuestEmail(event: any, guestName: string, qrCodeDataURL: string, tableInfo: any, numberOfPersons: number, tableNote: string | null): string {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const logoUrl = event.logo_url
    ? `${supabaseUrl}/storage/v1/object/public/${event.logo_url}`
    : null;

  const BASE_URL = Deno.env.get('BASE_URL') || 'https://bizimevents.be';
  const eskilerLogoUrl = `${BASE_URL}/eskiler-logo-4.png`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Je Tafel Reservering voor ${event.name}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #0891b2 0%, #0e7490 100%); padding: 40px 24px; text-align: center;">
      ${logoUrl ? `<div style="margin-bottom: 20px;">
        <img src="${logoUrl}" alt="${event.name}" style="max-width: 200px; height: auto; display: inline-block;" />
      </div>` : ''}
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">Tafel Reservering</h1>
      <p style="color: rgba(255,255,255,0.95); margin: 12px 0 0 0; font-size: 18px;">${event.name}</p>
    </div>
    <div style="padding: 40px 24px;">
      <p style="color: #0f172a; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">Beste ${guestName},</p>
      <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 32px 0;">
        Je hebt een <strong>tafel reservering</strong> ontvangen voor <strong>${event.name}</strong>.
        Toon deze QR code bij de ingang.
      </p>
      <div style="background-color: #f8fafc; border-left: 4px solid #0891b2; padding: 20px; margin-bottom: 32px; border-radius: 8px;">
        <h2 style="color: #0f172a; margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">Evenement Details</h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.8; margin: 0;">
          <strong style="color: #0f172a;">Datum:</strong> ${formatDate(event.start_date)}<br />
          <strong style="color: #0f172a;">Tijd:</strong> ${formatTime(event.start_date)}<br />
          ${event.location ? `<strong style="color: #0f172a;">Locatie:</strong> ${event.location}<br />` : ''}
        </p>
      </div>
      <div style="background-color: #ecfeff; border: 2px solid #0891b2; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
        <h2 style="color: #0e7490; margin: 0 0 16px 0; font-size: 20px; font-weight: 600; text-align: center;">
          Tafel: ${tableInfo.table_number}
        </h2>
        <p style="color: #0f172a; font-size: 14px; line-height: 1.8; margin: 0; text-align: center;">
          <strong>Type:</strong> ${tableInfo.table_type === 'SEATED' ? 'Zittafel' : 'Sta-tafel'}<br />
          <strong>Capaciteit:</strong> ${tableInfo.capacity} personen<br />
          <strong>Aantal gasten:</strong> ${numberOfPersons} personen
        </p>
        ${tableNote ? `
        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #0891b2;">
          <p style="color: #0e7490; font-size: 14px; margin: 0; text-align: center;">
            <strong style="color: #0f172a;">Notitie:</strong> ${tableNote}
          </p>
        </div>
        ` : ''}
      </div>
      <div style="background-color: #ffffff; border: 2px solid #e2e8f0; border-radius: 12px; padding: 32px; margin-bottom: 32px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="${eskilerLogoUrl}" alt="Eskiler Logo" style="max-width: 150px; height: auto;" />
        </div>
        <h3 style="color: #0f172a; margin: 0 0 20px 0; font-size: 18px;">Tafel Reservering</h3>
        <div style="margin: 24px 0;">
          <img src="${qrCodeDataURL}" alt="QR Code" style="max-width: 250px; height: auto; border: 1px solid #cbd5e1; border-radius: 8px;" />
        </div>
      </div>
      <div style="background-color: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 16px; margin-bottom: 32px;">
        <p style="color: #92400e; font-size: 14px; line-height: 1.6; margin: 0;">
          <strong>Belangrijk:</strong> Toon deze QR code bij de ingang van het evenement.
          Je kan deze email bewaren of een screenshot maken van de QR code.
        </p>
      </div>
      <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
        Heb je vragen? Neem contact met ons op via <a href="mailto:info@bizimevents.be" style="color: #0891b2; text-decoration: none;">info@bizimevents.be</a>
      </p>
      <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0;">
        Tot binnenkort!<br />
        <strong style="color: #0f172a;">Team Eskiler</strong>
      </p>
    </div>
    <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="color: #64748b; font-size: 13px; margin: 0 0 8px 0;">
        ${new Date().getFullYear()} Eskiler. Alle rechten voorbehouden.
      </p>
      <p style="color: #94a3b8; font-size: 12px; margin: 0;">Powered by Lumetrix</p>
    </div>
  </div>
</body>
</html>
  `;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {

    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing authorization header' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await authClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid or expired token' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: userRoles } = await adminClient
      .from('user_roles')
      .select('role, event_id')
      .eq('user_id', user.id);

    const isSuperAdmin = userRoles?.some(r => r.role === 'superadmin' || r.role === 'super_admin');
    const isAdmin = userRoles?.some(r => r.role === 'admin' || r.role === 'organizer');

    if (!isSuperAdmin && !isAdmin) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Insufficient permissions' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: ResendRequest = await req.json();
    const { table_guest_id } = body;

    if (!table_guest_id) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing table_guest_id' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }


    const { data: tableGuest, error: guestError } = await adminClient
      .from('table_guests')
      .select('*, events(*), floorplan_tables(*)')
      .eq('id', table_guest_id)
      .single();

    if (guestError || !tableGuest) {
      console.error('RESEND: Table guest not found:', guestError);
      return new Response(
        JSON.stringify({ ok: false, error: 'Table guest not found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isSuperAdmin) {
      const hasEventAccess = userRoles?.some(r =>
        (r.role === 'admin' || r.role === 'organizer') &&
        (r.event_id === tableGuest.event_id || r.event_id === null)
      );

      if (!hasEventAccess) {
        return new Response(
          JSON.stringify({ ok: false, error: 'No access to this event' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const event = tableGuest.events;
    const tableInfo = tableGuest.floorplan_tables;

    if (!event || !tableInfo) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Event or table data missing' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const qrCodeDataURL = await generateQRCode(tableGuest.qr_code);

    const emailHtml = buildTableGuestEmail(
      event,
      tableGuest.guest_name,
      qrCodeDataURL,
      tableInfo,
      tableGuest.number_of_persons,
      tableGuest.table_note
    );

    const emailResult = await sendEmail({
      to: tableGuest.guest_email,
      subject: `Tafel Reservering: ${event.name} - ${tableInfo.table_number}`,
      html: emailHtml,
    });

    if (emailResult.id) {
      await adminClient
        .from('table_guests')
        .update({
          email_sent: true,
          email_sent_at: new Date().toISOString(),
          email_error: null,
        })
        .eq('id', table_guest_id);
    } else {
      await adminClient
        .from('table_guests')
        .update({
          email_error: emailResult.error || 'Unknown email error',
        })
        .eq('id', table_guest_id);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: emailResult.id ? 'Email sent successfully' : 'Email failed to send',
        email_sent: !!emailResult.id,
        email_id: emailResult.id,
        email_error: emailResult.error,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('RESEND-TABLE-GUEST-EMAIL error:', error);

    return new Response(
      JSON.stringify({
        ok: false,
        error: String(error.message || error),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
