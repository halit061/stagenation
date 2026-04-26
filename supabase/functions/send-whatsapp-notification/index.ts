import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders } from "../_shared/cors.ts";

interface WhatsAppNotificationRequest {
  orderId: string;
  eventId: string;
}

Deno.serve(async (req: Request) => {
  console.log('📱 WhatsApp function called, method:', req.method);
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Auth: only accept service role key (internal calls only)
    const authHeader = req.headers.get('Authorization');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const token = authHeader?.replace('Bearer ', '');
    if (token !== supabaseServiceKey) {
      console.error('❌ WhatsApp auth failed - token mismatch');
      console.error('   Auth header present:', !!authHeader);
      console.error('   Token length:', token?.length || 0);
      console.error('   Expected length:', supabaseServiceKey?.length || 0);
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    console.log('✅ Auth passed');

    // Check WhatsApp config - supports multiple recipients
    // Format: "phone1:apikey1,phone2:apikey2"
    const whatsappRecipients = Deno.env.get('WHATSAPP_RECIPIENTS');

    // Fallback: legacy single-number config
    const legacyPhone = Deno.env.get('WHATSAPP_PHONE');
    const legacyApiKey = Deno.env.get('WHATSAPP_API_KEY');

    console.log('📋 WHATSAPP_RECIPIENTS set:', !!whatsappRecipients, 'length:', whatsappRecipients?.length || 0);
    console.log('📋 Legacy WHATSAPP_PHONE set:', !!legacyPhone);
    console.log('📋 Legacy WHATSAPP_API_KEY set:', !!legacyApiKey);

    const recipients: { phone: string; apikey: string }[] = [];

    if (whatsappRecipients) {
      for (const entry of whatsappRecipients.split(',')) {
        const [phone, apikey] = entry.trim().split(':');
        if (phone && apikey) {
          recipients.push({ phone: phone.trim(), apikey: apikey.trim() });
        }
      }
    } else if (legacyPhone && legacyApiKey) {
      recipients.push({ phone: legacyPhone, apikey: legacyApiKey });
    }

    console.log('📋 Parsed recipients count:', recipients.length);
    if (recipients.length > 0) {
      console.log('📋 Recipients:', recipients.map(r => r.phone).join(', '));
    }

    if (recipients.length === 0) {
      console.log('⚠️ WhatsApp notification skipped: no recipients configured');
      console.log('   Raw WHATSAPP_RECIPIENTS value:', whatsappRecipients ? `"${whatsappRecipients}"` : '(not set)');
      return new Response(JSON.stringify({ ok: true, skipped: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Parse request
    const body: WhatsAppNotificationRequest = await req.json();
    const { orderId, eventId } = body;

    if (!orderId || !eventId) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing orderId or eventId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Set up Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Helper: replace Turkish special chars with ASCII (CallMeBot strips non-ASCII)
    const fixTurkish = (text: string) => text
      .replace(/ş/g, 's').replace(/Ş/g, 'S')
      .replace(/ı/g, 'i').replace(/İ/g, 'I')
      .replace(/ö/g, 'o').replace(/Ö/g, 'O')
      .replace(/ü/g, 'u').replace(/Ü/g, 'U')
      .replace(/ç/g, 'c').replace(/Ç/g, 'C')
      .replace(/ğ/g, 'g').replace(/Ğ/g, 'G');

    // Fetch order (minimal - no personal data needed)
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('order_number, event_id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      console.error('Order not found:', orderId, orderError);
      return new Response(JSON.stringify({ ok: false, error: 'Order not found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch event name
    const { data: event } = await supabase
      .from('events')
      .select('name')
      .eq('id', eventId)
      .single();

    // Fetch ticket items for this order (quantity only, no price)
    const { data: ticketOrder } = await supabase
      .from('ticket_orders')
      .select('id, quantity')
      .eq('order_id', order.order_number)
      .maybeSingle();

    let itemLines = '';
    if (ticketOrder) {
      const { data: items } = await supabase
        .from('ticket_order_items')
        .select('ticket_type_name, quantity')
        .eq('ticket_order_id', ticketOrder.id);

      if (items && items.length > 0) {
        itemLines = items.map(i =>
          `  ${i.quantity}x ${fixTurkish(i.ticket_type_name)}`
        ).join('\n');
      }
    }

    // Get per-ticket-type totals for this event
    const { data: allOrderItems } = await supabase
      .from('ticket_order_items')
      .select('ticket_type_name, quantity, ticket_order_id')
      .in('ticket_order_id',
        (await supabase
          .from('ticket_orders')
          .select('id')
          .eq('event_id', eventId)
        ).data?.map((to: any) => to.id) || []
      );

    let totalTickets = 0;
    let typeBreakdownLines = '';
    if (allOrderItems && allOrderItems.length > 0) {
      const typeTotals: Record<string, number> = {};
      for (const item of allOrderItems) {
        const name = item.ticket_type_name || 'Diger';
        typeTotals[name] = (typeTotals[name] || 0) + (item.quantity || 0);
        totalTickets += (item.quantity || 0);
      }
      typeBreakdownLines = Object.entries(typeTotals)
        .map(([name, qty]) => `  ${fixTurkish(name)}: ${qty}`)
        .join('\n');
    }

    // Get total revenue for this event
    const { data: salesSummary } = await supabase
      .from('v_ticket_sales_summary')
      .select('total_revenue_cents')
      .eq('event_id', eventId)
      .single();

    const totalRevenue = salesSummary?.total_revenue_cents
      ? (Number(salesSummary.total_revenue_cents) / 100).toFixed(2)
      : '0.00';

    // Build message — NO personal data
    const message = fixTurkish([
      `*YENI BILET SATISI*`,
      ``,
      `*${event?.name || 'Event'}*`,
      itemLines || '',
      ``,
      `*TOPLAM: ${totalTickets} bilet*`,
      typeBreakdownLines,
      ``,
      `*EUR${totalRevenue}*`,
    ].filter(Boolean).join('\n'));

    // Send via CallMeBot to all recipients
    const encodedMessage = encodeURIComponent(message);
    const results: { phone: string; ok: boolean; error?: string }[] = [];

    console.log('📤 Sending to', recipients.length, 'recipient(s)...');

    for (const recipient of recipients) {
      try {
        // URL-encode phone number to handle + sign properly
        const encodedPhone = encodeURIComponent(recipient.phone);
        const callmebotUrl = `https://api.callmebot.com/whatsapp.php?phone=${encodedPhone}&text=${encodedMessage}&apikey=${recipient.apikey}`;
        console.log(`📤 Calling CallMeBot for ${recipient.phone}...`);
        const whatsappResponse = await fetch(callmebotUrl);
        const responseText = await whatsappResponse.text();

        if (!whatsappResponse.ok) {
          console.error(`❌ WhatsApp failed for ${recipient.phone}:`, whatsappResponse.status, responseText);
          results.push({ phone: recipient.phone, ok: false, error: responseText });
        } else {
          console.log(`✅ WhatsApp sent to ${recipient.phone} for order:`, order.order_number, '- Response:', responseText.substring(0, 100));
          results.push({ phone: recipient.phone, ok: true });
        }

        // Small delay between messages to avoid CallMeBot rate limiting
        if (recipients.length > 1) {
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (sendError) {
        console.error(`WhatsApp exception for ${recipient.phone}:`, sendError.message);
        results.push({ phone: recipient.phone, ok: false, error: sendError.message });
      }
    }

    const allOk = results.every(r => r.ok);
    console.log(`WhatsApp notifications: ${results.filter(r => r.ok).length}/${results.length} sent`);
    return new Response(JSON.stringify({ ok: allOk, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('❌ WhatsApp notification CRASH:', error);
    console.error('   Error type:', error.constructor?.name);
    console.error('   Error message:', error.message);
    console.error('   Stack:', error.stack);
    // Always return 200 - this is a non-critical notification
    return new Response(JSON.stringify({ ok: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
