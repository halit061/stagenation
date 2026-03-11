# Quick Test Guide - Post-Payment Flow

## ⚡ 5-Minute Test

### Step 1: Make Test Purchase
1. Go to https://eskiler.be/#tickets
2. Select any ticket(s)
3. Fill checkout form with your email
4. Click "Betalen met Mollie"
5. Complete payment (use Mollie test mode)

### Step 2: Verify Redirect
**Expected:** Redirected to `https://eskiler.be/#payment-success?order_id={id}`

**What You Should See:**
- Initially: "Betaling Verwerken..." (Processing)
- After 1-3 seconds: "Betaling Geslaagd!" (Success!) with green checkmark
- Order details displayed
- Event information shown
- Ticket list with "Geldig" (Valid) status
- Email confirmation notice

**If Stuck on Processing:**
- Wait 30 seconds (webhook might be slow)
- Check browser console for errors
- Check order status in database (see below)

### Step 3: Check Email
**Where:** Check inbox of email used in checkout

**Expected Email:**
- From: "Eskiler Tickets <tickets@send.lumetrix.be>"
- Subject: "🎟️ Je tickets voor {event_name}"
- Contains: QR codes for all tickets
- Contains: Event details, order number, holder info

**If No Email:**
- Check spam folder
- Wait 2 minutes (Resend might be slow)
- Check Edge Function logs (see below)

### Step 4: Verify in Database
```sql
-- Find your order
SELECT
  order_number,
  status,
  paid_at,
  email_sent,
  email_sent_at,
  payer_email
FROM orders
WHERE payer_email = 'YOUR_EMAIL'
ORDER BY created_at DESC
LIMIT 1;

-- Should show:
-- status: 'paid'
-- paid_at: [timestamp]
-- email_sent: true
-- email_sent_at: [timestamp]

-- Check email log
SELECT * FROM email_logs
WHERE order_id = (
  SELECT id FROM orders
  WHERE payer_email = 'YOUR_EMAIL'
  ORDER BY created_at DESC
  LIMIT 1
);

-- Should show:
-- status: 'sent'
-- error_message: null
```

---

## 🔍 Check Edge Function Logs

### Webhook Logs
1. Go to Supabase Dashboard
2. Edge Functions > mollie-webhook > Logs
3. Look for your payment

**Expected Output:**
```
✅ Payment PAID for order [uuid] [TKT-...]
📧 Triggering email send for order [TKT-...]
✅ Email function response: { success: true, ... }
```

### Email Function Logs
1. Go to Supabase Dashboard
2. Edge Functions > send-ticket-email > Logs
3. Look for your order

**Expected Output:**
```
🔔 Email trigger fired for order [uuid]
📨 Sending email to [your-email]...
📧 Sending email to: [your-email]
✅ Email sent successfully. Resend ID: [id]
```

---

## ❌ If Something Goes Wrong

### Redirect Goes to Homepage
**Problem:** Old Edge Function deployed
**Fix:** Already fixed and redeployed. Try again.

### Success Page Shows "Processing" Forever
**Problem:** Webhook not processing

**Check:**
1. Webhook logs (see above)
2. Order status in database
3. Mollie payment status in Mollie Dashboard

**Manual Fix:**
```sql
UPDATE orders
SET status = 'paid', paid_at = NOW()
WHERE order_number = 'YOUR_ORDER_NUMBER';
```

### No Email Received
**Problem:** Email function failed or not triggered

**Check:**
1. Email function logs (see above)
2. Webhook logs for email trigger
3. email_logs table for error

**Manual Fix:**
Use SuperAdmin > Orders > Resend Email button

### Email Shows Error in Logs
**Problem:** Resend API issue or configuration

**Check:**
1. RESEND_API_KEY in Edge Functions settings
2. Domain send.lumetrix.be verified in Resend
3. Error message in email_logs table

**Common Errors:**
- "Email service not configured" → RESEND_API_KEY missing
- "Failed to send email: 403" → Domain not verified
- "Failed to send email: 422" → Invalid email format

---

## ✅ Success Checklist

After completing test purchase:

- [ ] Redirected to `/#payment-success?order_id=...`
- [ ] Success page shows green checkmark
- [ ] Order status is "paid" in database
- [ ] Tickets status is "valid" in database
- [ ] Email received with QR codes
- [ ] email_logs shows status='sent'
- [ ] No errors in Edge Function logs

If all checked: **🎉 SYSTEM WORKING PERFECTLY!**

If not all checked: See troubleshooting in `PAYMENT_FLOW_COMPLETE.md`

---

## 📊 Quick Status Check

Run this SQL query for instant status:
```sql
-- Get latest order stats
WITH latest_orders AS (
  SELECT * FROM orders
  WHERE created_at > NOW() - INTERVAL '1 hour'
  ORDER BY created_at DESC
  LIMIT 10
)
SELECT
  order_number,
  status,
  CASE
    WHEN email_sent THEN '✅ Sent'
    WHEN email_error IS NOT NULL THEN '❌ Error'
    ELSE '⏳ Pending'
  END as email_status,
  payer_email,
  created_at
FROM latest_orders;
```

---

## 🎯 Performance Expectations

**Redirect Time:** Immediate (< 1 second)
**Webhook Processing:** 1-5 seconds
**Email Delivery:** 2-10 seconds
**Total Time (payment to email):** 5-15 seconds

**Page Polling:** Every 3 seconds, max 60 seconds

If taking longer:
- Check Edge Function logs for errors
- Check Mollie webhook delivery in Mollie Dashboard
- Check Resend delivery logs in Resend Dashboard

---

## 🔗 Quick Links

**Supabase Dashboard:**
- Edge Functions: [Supabase Dashboard URL]/functions
- Database: [Supabase Dashboard URL]/database/tables

**Mollie Dashboard:**
- Test Payments: https://www.mollie.com/dashboard/payments
- Webhooks: https://www.mollie.com/dashboard/developers/webhooks

**Resend Dashboard:**
- Emails: https://resend.com/emails
- Domains: https://resend.com/domains

**Live Site:**
- Homepage: https://eskiler.be
- Tickets: https://eskiler.be/#tickets
- SuperAdmin: https://eskiler.be/superadmin.html

---

## 💡 Pro Tips

1. **Use your own email** for test purchases to verify email delivery
2. **Keep Edge Function logs open** during testing to see real-time activity
3. **Use Mollie test mode** to avoid real charges
4. **Check spam folder** if email not in inbox
5. **Wait 30 seconds** before assuming something failed (webhooks can be slow)
6. **Use SuperAdmin** to resend emails if needed, no need to debug immediately
7. **Check browser console** on success page for any JavaScript errors

---

## 📱 Mobile Testing

The payment success page is fully responsive. Test on:
- Desktop browser
- Mobile browser (iPhone/Android)
- Tablet

All should show appropriate layout and polling should work on all devices.

---

## 🎓 Understanding the Flow

```
User Checkout → Mollie Payment → Webhook & Redirect
                                   ↓         ↓
                              Update DB   Success Page
                                   ↓
                              Send Email
```

**Parallel Processing:**
- Webhook processes in background (async)
- User sees success page immediately
- Page polls for status updates
- Email sends automatically via webhook

**Timing:**
- User redirect: Immediate
- Webhook processing: 1-5 seconds after payment
- Email delivery: 2-10 seconds after webhook
- Page updates: Every 3 seconds (polling)

This ensures users see success quickly while processing happens reliably in the background.

---

**Need Help?** See full documentation in `PAYMENT_FLOW_COMPLETE.md`
