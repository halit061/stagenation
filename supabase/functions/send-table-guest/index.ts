import { createClient } from 'npm:@supabase/supabase-js@2';
import { Resend } from 'npm:resend@4.0.0';
import QRCode from 'npm:qrcode@1.5.4';
import { getCorsHeaders } from "../_shared/cors.ts";

interface SendTableGuestRequest {
  event_id: string;
  assigned_table_id: string;
  guest_name: string;
  guest_email: string;
  number_of_persons: number;
  table_note?: string;
}

interface TableInfo {
  id: string;
  table_number: string;
  table_type: string;
  capacity: number;
}

// SECURITY: Input validation helpers
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function sanitizeString(val: string, maxLen = 200): string {
  return val.trim().substring(0, maxLen).replace(/<[^>]*>/g, '');
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateHexToken(bytes: number): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

async function generateQRCode(data: string): Promise<string> {
  return await QRCode.toDataURL(data, { width: 300, margin: 2 });
}

async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<{ id: string | null; error: string | null }> {
  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const emailFrom = Deno.env.get('EMAIL_FROM') || 'Eskiler Tickets <tickets@lumetrix.be>';

    if (!resendApiKey) {
      console.error('CRITICAL: RESEND_API_KEY is not configured!');
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
      console.error('EMAIL_SEND: Resend error:', result.error);
      return { id: null, error: result.error.message || 'Resend API error' };
    }

    const emailId = result?.data?.id || result?.id;
    if (!emailId) {
      return { id: null, error: 'No email ID returned' };
    }

    return { id: emailId, error: null };
  } catch (error) {
    console.error('EMAIL_SEND: Exception:', error.message);
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

function buildTableGuestEmail(
  event: any,
  guestName: string,
  qrCodeDataURL: string,
  tableInfo: TableInfo,
  numberOfPersons: number,
  tableNote: string | null,
  ticketNumber: string
): string {
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
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">
        Tafel Reservering
      </h1>
      <p style="color: rgba(255,255,255,0.95); margin: 12px 0 0 0; font-size: 18px;">
        ${event.name}
      </p>
    </div>

    <div style="padding: 40px 24px;">
      <p style="color: #0f172a; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
        Beste ${escapeHtml(guestName)},
      </p>

      <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 32px 0;">
        Je hebt een <strong>tafel reservering</strong> ontvangen voor <strong>${event.name}</strong>.
        Toon deze QR code bij de ingang.
      </p>

      <div style="background-color: #f8fafc; border-left: 4px solid #0891b2; padding: 20px; margin-bottom: 32px; border-radius: 8px;">
        <h2 style="color: #0f172a; margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">
          Evenement Details
        </h2>
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
            <strong style="color: #0f172a;">Notitie:</strong> ${escapeHtml(tableNote)}
          </p>
        </div>
        ` : ''}
      </div>

      <div style="background-color: #ffffff; border: 2px solid #e2e8f0; border-radius: 12px; padding: 32px; margin-bottom: 32px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="${eskilerLogoUrl}" alt="Eskiler Logo" style="max-width: 150px; height: auto;" />
        </div>
        <h3 style="color: #0f172a; margin: 0 0 20px 0; font-size: 18px;">
          Tafel Reservering
        </h3>
        <div style="margin: 24px 0;">
          <img src="${qrCodeDataURL}" alt="QR Code" style="max-width: 250px; height: auto; border: 1px solid #cbd5e1; border-radius: 8px;" />
        </div>
        <div style="background-color: #f1f5f9; border-radius: 8px; padding: 16px; margin-top: 16px;">
          <p style="color: #64748b; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">
            Ticket Nummer
          </p>
          <p style="color: #0f172a; font-size: 16px; font-weight: 700; margin: 0; font-family: 'Courier New', monospace; letter-spacing: 1px;">
            ${ticketNumber}
          </p>
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
      <p style="color: #94a3b8; font-size: 12px; margin: 0;">
        Powered by Lumetrix
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
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

    // SECURITY: Only check active roles
    const { data: userRoles } = await adminClient
      .from('user_roles')
      .select('role, event_id')
      .eq('user_id', user.id)
      .eq('is_active', true);

    const isSuperAdmin = userRoles?.some(r => r.role === 'superadmin' || r.role === 'super_admin');
    const isAdmin = userRoles?.some(r => r.role === 'admin' || r.role === 'organizer');

    if (!isSuperAdmin && !isAdmin) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Insufficient permissions' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: SendTableGuestRequest = await req.json();
    const { event_id, assigned_table_id, guest_name, guest_email, number_of_persons, table_note } = body;

    if (!event_id || !assigned_table_id || !guest_name || !guest_email) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing required fields' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SECURITY: Validate and sanitize inputs
    if (!isValidEmail(guest_email)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid email format' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sanitizedGuestName = sanitizeString(guest_name, 200);
    const sanitizedTableNote = table_note ? sanitizeString(table_note, 500) : null;

    if (!sanitizedGuestName) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid guest name' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SECURITY: Rate limit per email address (max 5 guest emails per hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentGuests } = await adminClient
      .from('table_guests')
      .select('id')
      .eq('guest_email', guest_email)
      .gte('created_at', oneHourAgo);

    if (recentGuests && recentGuests.length >= 5) {
      console.warn(`[SECURITY] Table guest email rate limit hit for: ${guest_email}`);
      return new Response(
        JSON.stringify({ ok: false, error: 'Too many guest invitations sent to this email. Please try again later.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: event, error: eventError } = await adminClient
      .from('events')
      .select('*')
      .eq('id', event_id)
      .single();

    if (eventError || !event) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Event not found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: tableData, error: tableError } = await adminClient
      .from('floorplan_tables')
      .select('id, table_number, table_type, capacity')
      .eq('id', assigned_table_id)
      .single();

    if (tableError || !tableData) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Table not found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tableInfo: TableInfo = tableData;

    const ticketNumber = 'TABLE-' + Date.now() + '-' + generateHexToken(4).toUpperCase();
    const token = generateHexToken(16);
    const qrCode = generateHexToken(32);

    const { data: tableGuest, error: insertError } = await adminClient
      .from('table_guests')
      .insert({
        event_id,
        assigned_table_id,
        guest_name: sanitizedGuestName,
        guest_email,
        number_of_persons: number_of_persons || 1,
        table_note: sanitizedTableNote,
        qr_code: qrCode,
        ticket_number: ticketNumber,
        status: 'valid',
        created_by_user_id: user.id,
        created_by_email: user.email || '',
      })
      .select()
      .single();

    if (insertError || !tableGuest) {
      console.error('Failed to create table guest:', insertError);
      return new Response(
        JSON.stringify({ ok: false, error: 'Failed to create table guest', details: insertError?.message }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let ticketId: string | null = null;
    let ticketCreated = false;

    try {
      let ticketTypeId: string | null = null;
      const { data: existingType } = await adminClient
        .from('ticket_types')
        .select('id')
        .eq('event_id', event_id)
        .eq('name', 'Tafel Gast')
        .maybeSingle();

      if (existingType) {
        ticketTypeId = existingType.id;
      } else {
        const { data: newType } = await adminClient
          .from('ticket_types')
          .insert({
            event_id,
            name: 'Tafel Gast',
            description: 'Tafel gast ticket',
            price: 0,
            quantity_total: 999999,
            is_active: true
          })
          .select('id')
          .single();
        ticketTypeId = newType?.id || null;
      }

      let orderId: string | null = null;
      const { data: existingOrder } = await adminClient
        .from('orders')
        .select('id')
        .eq('event_id', event_id)
        .like('order_number', 'GUEST-ORDER-%')
        .eq('status', 'paid')
        .maybeSingle();

      if (existingOrder) {
        orderId = existingOrder.id;
      } else {
        const { data: newOrder } = await adminClient
          .from('orders')
          .insert({
            event_id,
            order_number: 'GUEST-ORDER-' + Date.now(),
            payer_email: 'system@eventgate.app',
            payer_name: 'Table Guest System',
            total_amount: 0,
            subtotal_amount: 0,
            administration_fee: 0,
            status: 'paid',
            product_type: 'TABLE',
            paid_at: new Date().toISOString()
          })
          .select('id')
          .single();
        orderId = newOrder?.id || null;
      }

      if (ticketTypeId && orderId) {
        const { data: ticket, error: ticketErr } = await adminClient
          .from('tickets')
          .insert({
            order_id: orderId,
            event_id,
            ticket_type_id: ticketTypeId,
            ticket_number: ticketNumber,
            token: token,
            qr_data: qrCode,
            qr_code: qrCode,
            status: 'valid',
            scan_status: 'valid',
            holder_name: sanitizedGuestName,
            holder_email: guest_email,
            product_type: 'TABLE',
            assigned_table_id,
            table_note: sanitizedTableNote,
            table_guest_id: tableGuest.id,
            metadata: { type: 'table_guest', number_of_persons: number_of_persons || 1 }
          })
          .select('id')
          .single();

        if (ticket && !ticketErr) {
          ticketId = ticket.id;
          ticketCreated = true;

          await adminClient
            .from('table_guests')
            .update({ ticket_id: ticketId, order_id: orderId })
            .eq('id', tableGuest.id);
        } else {
          console.error('SEND-TABLE-GUEST: Failed to create ticket:', ticketErr);
        }
      } else if (orderId) {
        await adminClient
          .from('table_guests')
          .update({ order_id: orderId })
          .eq('id', tableGuest.id);
      }
    } catch (ticketException) {
      console.error('SEND-TABLE-GUEST: Ticket creation exception (non-blocking):', ticketException);
    }

    const bookingCode = `GUEST-${Date.now().toString(36).toUpperCase()}`;
    await adminClient
      .from('table_bookings')
      .insert({
        event_id,
        floorplan_table_id: assigned_table_id,
        customer_name: sanitizedGuestName,
        customer_email: guest_email,
        customer_phone: '',
        number_of_guests: number_of_persons || 1,
        special_requests: sanitizedTableNote || 'Tafel Gast',
        total_price: 0,
        status: 'GUEST',
        booking_code: bookingCode,
        paid_at: new Date().toISOString(),
      })
      .catch(e => console.error('SEND-TABLE-GUEST: Booking creation failed:', e));

    await adminClient
      .from('floorplan_tables')
      .update({ manual_status: 'SOLD' })
      .eq('id', assigned_table_id);

    let emailSent = false;
    let emailId: string | null = null;
    let emailError: string | null = null;

    try {
      const qrCodeDataURL = await generateQRCode(qrCode);

      if (!qrCodeDataURL) {
        emailError = 'QR code generation failed';
      } else {
        const emailHtml = buildTableGuestEmail(
          event,
          sanitizedGuestName,
          qrCodeDataURL,
          tableInfo,
          number_of_persons || 1,
          sanitizedTableNote,
          ticketNumber
        );

        const emailResult = await sendEmail({
          to: guest_email,
          subject: `Tafel Reservering: ${event.name} - Tafel ${tableInfo.table_number}`,
          html: emailHtml,
        });

        if (emailResult.id) {
          emailSent = true;
          emailId = emailResult.id;
        } else {
          emailError = emailResult.error || 'Email send failed';
        }
      }
    } catch (emailException) {
      console.error('SEND-TABLE-GUEST: Email exception:', emailException);
      emailError = String(emailException?.message || emailException || 'Email exception');
    }

    await adminClient
      .from('table_guests')
      .update({
        email_sent: emailSent,
        email_sent_at: emailSent ? new Date().toISOString() : null,
        email_error: emailSent ? null : emailError,
      })
      .eq('id', tableGuest.id);

    return new Response(
      JSON.stringify({
        ok: true,
        message: 'Table guest created successfully',
        table_guest_id: tableGuest.id,
        ticket_id: ticketId,
        ticket_number: ticketNumber,
        ticket_created: ticketCreated,
        qr_code: qrCode,
        assigned_table_id,
        event_id,
        email_sent: emailSent,
        email_id: emailId,
        email_error: emailError,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Guest table email function error:', error);

    return new Response(
      JSON.stringify({
        ok: false,
        error: String(error.message || error),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
