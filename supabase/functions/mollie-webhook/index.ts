import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders } from "../_shared/cors.ts";

// SECURITY: Verify webhook came from Mollie by fetching payment from their API
// Mollie webhooks only send a payment ID - we verify by fetching from Mollie's API
// with our secret API key. If the payment exists, it's a valid webhook.
// Additionally validate the payment ID format to prevent SSRF.
function isValidMolliePaymentId(id: string): boolean {
  return /^tr_[a-zA-Z0-9]+$/.test(id);
}

async function handleDrinkOrderPayment(payment: any, supabase: any, supabaseUrl: string, supabaseServiceKey: string, corsHeaders: Record<string, string>) {
  const drinkOrderId = payment.metadata?.order_id;
  const eventId = payment.metadata?.event_id;

  if (!drinkOrderId) {
    console.error('Missing order_id in drink order payment metadata');
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const { data: drinkOrder } = await supabase.from('drink_orders').select('*').eq('id', drinkOrderId).maybeSingle();
  if (!drinkOrder) {
    console.error('Drink order not found:', drinkOrderId);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (payment.status === 'paid' && drinkOrder.status === 'PENDING_PAYMENT') {
    try {
      const displayCode = await generateDisplayCode(supabase, eventId);

      await supabase.from('drink_orders').update({
        status: 'PAID',
        paid_at: new Date().toISOString(),
        display_code: displayCode
      }).eq('id', drinkOrder.id);

      const { data: orderItems } = await supabase
        .from('drink_order_items')
        .select('drink_id, quantity')
        .eq('drink_order_id', drinkOrder.id);

      if (orderItems) {
        for (const item of orderItems) {
          try {
            const { error } = await supabase.rpc('deduct_drink_stock', {
              p_event_id: eventId,
              p_drink_id: item.drink_id,
              p_quantity: item.quantity
            });

            if (error) {
              console.error('Failed to deduct stock:', error);
            }
          } catch (stockError) {
            console.error('Stock deduction error:', stockError);
          }
        }
      }

      try {
        const qrResponse = await fetch(`${supabaseUrl}/functions/v1/generate-drink-qr`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: drinkOrder.id }),
        });
        if (!qrResponse.ok) {
          console.error('QR generation failed for drink order', drinkOrder.id);
        }
      } catch (qrError) {
        console.error('QR generation error:', qrError);
      }

    } catch (error) {
      console.error('Error processing paid drink order:', error);
    }
  } else if (payment.status === 'failed' || payment.status === 'canceled' || payment.status === 'expired') {
    await supabase.from('drink_orders').update({
      status: 'CANCELLED'
    }).eq('id', drinkOrder.id);
  }

  await supabase.from('webhook_logs').insert({
    provider: 'mollie',
    event_type: payment.id,
    payload: payment,
    signature_valid: true, // Verified by successful Mollie API fetch
    processed: true
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function generateDisplayCode(supabase: any, eventId: string): Promise<string> {
  const { data, error } = await supabase.rpc('generate_drink_order_display_code', { p_event_id: eventId });
  if (error || !data) {
    console.error('Failed to generate display code:', error);
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    const num = ((bytes[0] << 16) | (bytes[1] << 8) | bytes[2]) % 1000000;
    return num.toString().padStart(6, '0');
  }
  return data;
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
    const mollieApiKey = Deno.env.get('MOLLIE_API_KEY');

    if (!mollieApiKey) {
      console.error('MOLLIE_API_KEY not configured');
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const rawBody = await req.text();
    const params = new URLSearchParams(rawBody);
    const paymentId = params.get('id');

    if (!paymentId) {
      console.error('Missing payment id');
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // SECURITY: Validate payment ID format to prevent SSRF attacks
    if (!isValidMolliePaymentId(paymentId)) {
      console.error('SECURITY: Invalid payment ID format:', paymentId);
      await supabase.from('webhook_logs').insert({
        provider: 'mollie',
        event_type: 'invalid_payment_id',
        payload: { raw_id: paymentId },
        signature_valid: false,
        processed: false
      });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // SECURITY: Idempotency check - prevent duplicate processing
    // First, try to insert a processing lock. If it already exists and is processed, skip.
    const { data: existingLog } = await supabase.from('webhook_logs').select('id, processed').eq('provider', 'mollie').eq('event_type', paymentId).maybeSingle();
    if (existingLog?.processed) {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // Insert a pending log to claim this webhook (acts as a distributed lock)
    if (!existingLog) {
      const { error: lockError } = await supabase.from('webhook_logs').insert({
        provider: 'mollie',
        event_type: paymentId,
        payload: { status: 'processing' },
        signature_valid: false,
        processed: false
      });
      if (lockError?.code === '23505') {
        // Unique constraint violation = another instance already claimed this
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // SECURITY: Verify webhook authenticity by fetching payment from Mollie API
    // If we can successfully retrieve the payment with our API key, the webhook is legitimate
    const mollieResponse = await fetch(`https://api.mollie.com/v2/payments/${paymentId}`, { headers: { Authorization: `Bearer ${mollieApiKey}` } });
    if (!mollieResponse.ok) {
      console.error('SECURITY: Failed to verify payment from Mollie API - possible forged webhook');
      await supabase.from('webhook_logs').insert({
        provider: 'mollie',
        event_type: paymentId,
        payload: { error: 'Failed to verify with Mollie API', status: mollieResponse.status },
        signature_valid: false,
        processed: false
      });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const payment = await mollieResponse.json();
    const paymentType = payment.metadata?.type || 'order';

    if (paymentType === 'drink_order') {
      return await handleDrinkOrderPayment(payment, supabase, supabaseUrl, supabaseServiceKey, corsHeaders);
    }

    const orderId = payment.metadata?.orderId;
    if (!orderId) {
      console.error('Missing orderId in payment metadata');
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
    if (!order) {
      console.error('Order not found:', orderId);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (order.status === 'paid') {
      await supabase.from('webhook_logs').upsert({ provider: 'mollie', event_type: paymentId, payload: payment, signature_valid: true, processed: true, order_id: order.id }, { onConflict: 'provider,event_type' });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (payment.status === 'paid' && order.status === 'hold_expired') {
      await supabase.from('orders').update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        payment_method: payment.method,
        payment_id: payment.id,
        metadata: { ...order.metadata, paid_late: true, original_status: 'hold_expired' },
      }).eq('id', order.id);
      await supabase.from('webhook_logs').upsert({ provider: 'mollie', event_type: paymentId, payload: payment, signature_valid: true, processed: true, order_id: order.id }, { onConflict: 'provider,event_type' });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (payment.status === 'paid' && ['pending', 'reserved'].includes(order.status) && order.expires_at && new Date(order.expires_at) <= new Date()) {
      await supabase.from('orders').update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        payment_method: payment.method,
        payment_id: payment.id,
        metadata: { ...order.metadata, paid_late: true, original_status: order.status, expired_at: order.expires_at },
      }).eq('id', order.id);
      await supabase.from('tickets').update({ status: 'valid' }).eq('order_id', order.id).eq('status', 'pending');
      await supabase.from('webhook_logs').upsert({ provider: 'mollie', event_type: paymentId, payload: payment, signature_valid: true, processed: true, order_id: order.id }, { onConflict: 'provider,event_type' });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (payment.status === 'paid' && ['pending', 'reserved'].includes(order.status)) {
      await supabase.from('orders').update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        payment_method: payment.method,
        payment_id: payment.id
      }).eq('id', order.id);

      await supabase.from('tickets').update({ status: 'valid' }).eq('order_id', order.id).eq('status', 'pending');
      await supabase.from('table_bookings').update({ status: 'PAID', paid_at: new Date().toISOString() }).eq('order_id', order.id);

      if (order.product_type === 'seat') {
        try {
          const { data: seatRows } = await supabase
            .from('ticket_seats')
            .select('seat_id')
            .eq('order_id', order.id);
          if (seatRows && seatRows.length > 0) {
            const seatIds = seatRows.map((r: any) => r.seat_id);
            await supabase.from('seats').update({ status: 'sold' }).in('id', seatIds);
          }
          await supabase.from('seat_holds')
            .update({ status: 'converted' })
            .eq('session_id', order.session_id)
            .eq('event_id', order.event_id)
            .eq('status', 'held');
        } catch (seatError) {
          console.error('Error updating seat status:', seatError);
        }
      }

      // Legacy: release reserved stock for old hold-based orders
      if (order.reserved_items && Array.isArray(order.reserved_items)) {
        try {
          for (const item of order.reserved_items) {
            const ttId = item.ticket_type_id;
            const qty = item.quantity;
            const { data: tt } = await supabase
              .from('ticket_types')
              .select('quantity_sold, quantity_reserved, quantity_total')
              .eq('id', ttId)
              .maybeSingle();
            if (tt) {
              const newReserved = Math.max(0, (tt.quantity_reserved || 0) - qty);
              const newSold = tt.quantity_total !== null
                ? Math.min((tt.quantity_sold || 0) + qty, tt.quantity_total)
                : (tt.quantity_sold || 0) + qty;
              await supabase.from('ticket_types').update({
                quantity_reserved: newReserved,
                quantity_sold: newSold,
              }).eq('id', ttId);
            }
          }
        } catch (stockError) {
          console.error('❌ Error transferring reserved to sold:', stockError);
        }
      }
      // New flow: quantity_sold was already decremented at checkout time, no action needed here

      // Store ticket sales for analytics (idempotent)
      // product_type is 'VIP' or 'REGULAR' for ticket orders, 'TABLE' for table orders
      if (order.product_type !== 'TABLE') {
        try {
          const { data: existingSale } = await supabase
            .from('ticket_orders')
            .select('id')
            .eq('order_id', order.order_number)
            .maybeSingle();

          if (!existingSale) {
            const { data: tickets } = await supabase
              .from('tickets')
              .select('id, ticket_type_id, ticket_types(id, name, price)')
              .eq('order_id', order.id);

            if (tickets && tickets.length > 0) {
              const ticketsByType = new Map();
              let totalQuantity = 0;
              let totalAmount = 0;

              for (const ticket of tickets) {
                const typeId = ticket.ticket_type_id;
                const typeName = (ticket as any).ticket_types?.name || 'Unknown Ticket';
                const typePrice = (ticket as any).ticket_types?.price || 0;

                if (!ticketsByType.has(typeId)) {
                  ticketsByType.set(typeId, { typeId, typeName, typePrice, quantity: 0 });
                }
                ticketsByType.get(typeId).quantity++;
                totalQuantity++;
                totalAmount += typePrice;
              }

              const { data: ticketOrder, error: orderInsertError } = await supabase
                .from('ticket_orders')
                .insert({
                  event_id: order.event_id,
                  order_id: order.order_number,
                  buyer_name: order.payer_name,
                  buyer_email: order.payer_email,
                  buyer_phone: order.payer_phone,
                  quantity: totalQuantity,
                  subtotal_cents: totalAmount,
                  fee_cents: (order.service_fee_total_cents || 0) + (order.platform_fee_total_cents || 0),
                  total_cents: order.total_amount || totalAmount,
                  currency: 'EUR',
                  payment_provider: order.payment_provider || 'mollie',
                  payment_status: 'paid',
                  created_at: order.paid_at || new Date().toISOString()
                })
                .select()
                .single();

              if (orderInsertError) {
                console.error('❌ Failed to store ticket order:', orderInsertError);
              } else if (ticketOrder) {
                const itemsToInsert = Array.from(ticketsByType.values()).map((item: any) => ({
                  ticket_order_id: ticketOrder.id,
                  ticket_type_id: item.typeId,
                  ticket_type_name: item.typeName,
                  unit_price_cents: item.typePrice,
                  quantity: item.quantity,
                  line_total_cents: item.typePrice * item.quantity
                }));

                const { error: itemsInsertError } = await supabase
                  .from('ticket_order_items')
                  .insert(itemsToInsert);

                if (itemsInsertError) {
                  console.error('❌ Failed to store ticket order items:', itemsInsertError);
                }
              }
            }
          }
        } catch (salesError) {
          console.error('❌ Error storing ticket sales data:', salesError);
        }
      }

      const { data: tableBookings } = await supabase.from('table_bookings').select('id').eq('order_id', order.id);
      if (tableBookings && tableBookings.length > 0) {
        for (const booking of tableBookings) {
          try {
            const qrResponse = await fetch(`${supabaseUrl}/functions/v1/generate-table-qr`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ booking_id: booking.id }),
            });
            if (!qrResponse.ok) {
              console.error('❌ QR generation failed for booking', booking.id);
            }
          } catch (qrError) {
            console.error('❌ QR generation exception for booking', booking.id, qrError);
          }
        }
      }

      try {
        const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-ticket-email`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: order.id, resend: false }),
        });

        if (!emailResponse.ok) {
          console.error('[webhook] Email function failed:', emailResponse.status);

          await supabase.from('orders').update({
            email_error: `Email function failed: status ${emailResponse.status}`
          }).eq('id', order.id);
        }
      } catch (emailError) {
        console.error('[webhook] Email send exception:', emailError.message);

        try {
          await supabase.from('orders').update({
            email_error: `Email exception: ${emailError.message}`
          }).eq('id', order.id);
        } catch (updateError) {
          console.error('[webhook] Failed to update order with email error');
        }
      }

      if (order.product_type !== 'TABLE') {
        try {
          const waUrl = `${supabaseUrl}/functions/v1/send-whatsapp-notification`;
          const waResponse = await fetch(waUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: order.id, eventId: order.event_id }),
          });
          if (!waResponse.ok) {
            console.error('[webhook] WhatsApp notification failed:', waResponse.status);
          }
        } catch (waError) {
          console.error('[webhook] WhatsApp notification exception');
        }
      }
    } else if (payment.status === 'failed' || payment.status === 'canceled' || payment.status === 'expired') {
      const statusMap: Record<string, string> = {
        failed: 'payment_failed',
        canceled: 'payment_canceled',
        expired: 'payment_expired',
      };
      const orderStatus = statusMap[payment.status] || 'failed';
      await supabase.from('orders').update({ status: orderStatus }).eq('id', order.id);
      await supabase.from('tickets').update({ status: 'revoked', revoked_reason: `Payment ${payment.status}`, revoked_at: new Date().toISOString() }).eq('order_id', order.id).eq('status', 'pending');

      if (order.product_type === 'seat') {
        try {
          const { data: seatRows } = await supabase
            .from('ticket_seats')
            .select('seat_id')
            .eq('order_id', order.id);
          if (seatRows && seatRows.length > 0) {
            const seatIds = seatRows.map((r: any) => r.seat_id);
            await supabase.from('seats').update({ status: 'available' }).in('id', seatIds);
          }
          await supabase.from('seat_holds')
            .update({ status: 'released' })
            .eq('session_id', order.session_id)
            .eq('event_id', order.event_id)
            .eq('status', 'held');
        } catch (seatError) {
          console.error('Error releasing seats:', seatError);
        }
      }

      // Legacy: release reserved stock for old hold-based orders
      if (order.reserved_items && Array.isArray(order.reserved_items)) {
        try {
          for (const item of order.reserved_items) {
            const { data: tt } = await supabase
              .from('ticket_types')
              .select('quantity_reserved')
              .eq('id', item.ticket_type_id)
              .maybeSingle();
            if (tt) {
              await supabase.from('ticket_types').update({
                quantity_reserved: Math.max(0, (tt.quantity_reserved || 0) - item.quantity),
              }).eq('id', item.ticket_type_id);
            }
          }
        } catch (releaseError) {
          console.error('❌ Error releasing reserved stock:', releaseError);
        }
      } else if (order.product_type !== 'TABLE') {
        // SECURITY: Use atomic RPC to rollback stock (prevents race conditions)
        try {
          const { error: rollbackError } = await supabase.rpc('atomic_rollback_ticket_stock', {
            p_order_id: order.id,
          });
          if (rollbackError) {
            console.error('❌ Atomic stock rollback failed:', rollbackError);
          }
        } catch (rollbackError) {
          console.error('❌ Error rolling back ticket stock:', rollbackError);
        }
      }
    }

    await supabase.from('webhook_logs').upsert({ provider: 'mollie', event_type: paymentId, payload: payment, signature_valid: true, processed: true, order_id: order.id }, { onConflict: 'provider,event_type' });

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Mollie webhook error:', error);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
