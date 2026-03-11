# Post-Payment Email Delivery - Testing Guide

## Implementation Summary

The email delivery system has been completely implemented and deployed. Emails are automatically sent when orders transition to 'paid' status.

## What Was Implemented

### 1. Database Changes

**email_logs table** - Complete audit trail
```sql
- id (uuid, primary key)
- order_id (uuid, foreign key)
- status ('sent' | 'failed')
- provider ('resend')
- recipient_email (text)
- error_message (text, nullable)
- created_at (timestamptz)
```

**orders table** - Already has tracking fields
```sql
- email_sent (boolean, default false)
- email_sent_at (timestamptz, nullable)
- email_error (text, nullable)
```

### 2. Edge Functions Deployed

**send-ticket-email** ✓ DEPLOYED
- From: "Eskiler Tickets <tickets@send.lumetrix.be>"
- Subject: "🎟️ Je tickets voor {event_name}"
- Dutch language throughout
- QR codes embedded as base64
- Logs to email_logs table
- Prevents duplicates via email_sent check
- Checks order.status = 'paid' AND order.paid_at IS NOT NULL

**mollie-webhook** ✓ DEPLOYED
- Enhanced logging for debugging
- Calls send-ticket-email when payment.status = 'paid'
- Non-blocking error handling
- Detailed console output

### 3. Email Features

**Trigger Logic:**
- Fires ONLY when: order.status = 'paid' AND paid_at != null
- Prevents duplicates: checks email_sent field
- Won't send for 'pending' or 'failed' orders
- Page reloads do NOT trigger resends

**Email Content:**
- Event name, date, time, location
- Order number and customer details
- ALL tickets with individual QR codes
- Ticket type, number, holder info per ticket
- Important scanning instructions
- Support footer with contact info

**Error Handling:**
- Errors logged to orders.email_error
- Errors logged to email_logs table
- Email failures do NOT block checkout
- Console logging for debugging

## Testing Instructions

### Test 1: Verify Configuration

Check that Resend API is configured:

```bash
# In Supabase Dashboard > Edge Functions > Settings
# Verify RESEND_API_KEY is set
```

Expected: Key should be present (configured automatically)

### Test 2: Monitor Edge Function Logs

Before testing, open Edge Function logs:

1. Go to Supabase Dashboard
2. Navigate to Edge Functions
3. Open **mollie-webhook** logs
4. Open **send-ticket-email** logs (in another tab)
5. Keep both open during testing

### Test 3: Make a Test Purchase

1. Create a test order through the website
2. Use Mollie test mode
3. Complete payment
4. Watch the logs in real-time

**Expected Log Sequence in mollie-webhook:**
```
✅ Payment PAID for order [order_id] [order_number]
📧 Triggering email send for order [order_number]
✅ Email function response: { success: true, recipient: "...", ticketCount: X }
```

**Expected Log Sequence in send-ticket-email:**
```
🔔 Email trigger fired for order [order_id]
📨 Sending email to [email]...
📧 Sending email to: [email]
✅ Email sent successfully. Resend ID: [resend_id]
✅ Email sent successfully to [email] for order [order_number]
```

### Test 4: Check Database

After successful payment, verify in database:

```sql
-- Check order status
SELECT
  order_number,
  status,
  paid_at,
  email_sent,
  email_sent_at,
  email_error,
  payer_email
FROM orders
WHERE order_number = 'YOUR_ORDER_NUMBER';
```

**Expected Results:**
- status = 'paid'
- paid_at = [timestamp]
- email_sent = true
- email_sent_at = [timestamp]
- email_error = null

```sql
-- Check email logs
SELECT *
FROM email_logs
WHERE order_id = 'YOUR_ORDER_ID'
ORDER BY created_at DESC;
```

**Expected Results:**
- status = 'sent'
- provider = 'resend'
- recipient_email = [customer_email]
- error_message = null

### Test 5: Check Customer Email

1. Check the customer's inbox (use your own email for testing)
2. Look for subject: "🎟️ Je tickets voor {event_name}"
3. Verify email contains:
   - Event details (location, date, time)
   - Order number
   - All tickets with QR codes
   - Ticket holder names
   - Important notice

### Test 6: Duplicate Prevention

Try to trigger email again:

```sql
-- Try to call function directly (should fail)
-- This simulates what happens if webhook is called twice
```

In SuperAdmin > Orders tab, try "Resend Email" button:
- First time: Should succeed
- Without resend flag: Should show "already sent"
- With resend=true: Should send again

**Expected:** Email only sent once per order automatically, unless manually resent

### Test 7: Error Handling

Temporarily break something to test error logging:

1. In Supabase Dashboard, temporarily remove RESEND_API_KEY
2. Make a test purchase
3. Payment should succeed (not blocked)
4. Check logs for error message

**Expected in mollie-webhook logs:**
```
✅ Payment PAID for order [order_id] [order_number]
📧 Triggering email send for order [order_number]
❌ Email function returned error: ...
```

**Expected in database:**
```sql
SELECT email_error FROM orders WHERE order_number = 'TEST';
-- Should contain error message
```

```sql
SELECT * FROM email_logs WHERE status = 'failed';
-- Should have failed log entry
```

4. Restore RESEND_API_KEY
5. Use SuperAdmin > Orders > Resend Email button
6. Verify email sends successfully

## Debugging Common Issues

### Issue: No email received

**Check 1: Edge Function Logs**
```
Look for: "🔔 Email trigger fired for order"
- If missing: Webhook not called
- If present: Continue checking
```

**Check 2: Order Status**
```sql
SELECT status, paid_at, email_sent, email_error
FROM orders
WHERE order_number = 'YOUR_ORDER';
```
- status must be 'paid'
- paid_at must not be null
- Check email_error for error message

**Check 3: Email Logs**
```sql
SELECT * FROM email_logs
WHERE order_id = 'YOUR_ORDER_ID';
```
- If no entry: Function didn't reach email send
- If status='failed': Check error_message

**Check 4: Resend Configuration**
```
In Supabase Dashboard:
- Edge Functions > Settings
- Verify RESEND_API_KEY is set
- Verify domain send.lumetrix.be is verified in Resend
```

### Issue: Wrong sender email

**Current:** Uses `EMAIL_FROM` env variable or defaults to:
`Eskiler Tickets <tickets@send.lumetrix.be>`

To change:
1. Supabase Dashboard > Edge Functions > Settings
2. Add/update: `EMAIL_FROM=Your Name <your@domain.com>`

### Issue: Email in spam

**Check:**
1. SPF/DKIM records for send.lumetrix.be in Resend
2. Domain verification in Resend dashboard
3. Test with different email providers

### Issue: Duplicate emails

**Prevention in place:**
- orders.email_sent flag checked before sending
- If email_sent=true, skips (unless resend=true)

**To fix duplicate:**
```sql
UPDATE orders
SET email_sent = false,
    email_sent_at = NULL
WHERE order_number = 'YOUR_ORDER'
AND email_sent = true;
```

Then use SuperAdmin Resend button.

## Monitoring & Maintenance

### Daily Checks

```sql
-- Check for failed emails in last 24 hours
SELECT
  o.order_number,
  o.payer_email,
  o.email_error,
  o.created_at
FROM orders o
WHERE o.email_error IS NOT NULL
AND o.created_at > NOW() - INTERVAL '24 hours'
ORDER BY o.created_at DESC;
```

```sql
-- Check email success rate
SELECT
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM email_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY status;
```

### Weekly Review

1. Check Edge Function logs for patterns
2. Review failed emails in email_logs
3. Verify Resend quota/limits
4. Test with a real purchase

## SuperAdmin Features

**Orders Tab:**
- View all orders
- See email status indicators
- Check email errors
- Resend email button for paid orders

**Using Resend Button:**
1. Go to SuperAdmin > Orders
2. Find the order
3. Click "Resend Email"
4. Confirm action
5. Check logs for success

## Production Checklist

- [✓] email_logs table created
- [✓] Edge Functions deployed
- [✓] Trigger logic verified (status='paid' AND paid_at!=null)
- [✓] Duplicate prevention active
- [✓] Error logging in place
- [✓] Resend functionality available
- [✓] Correct sender email configured
- [✓] Dutch language in email
- [✓] QR codes embedded
- [ ] RESEND_API_KEY verified in production
- [ ] Domain send.lumetrix.be verified in Resend
- [ ] Test purchase completed successfully
- [ ] Email received by customer
- [ ] Monitoring set up

## Support

**For Email Issues:**
1. Check Edge Function logs first
2. Check email_logs table for details
3. Check orders.email_error field
4. Use SuperAdmin Resend button
5. Verify Resend configuration

**For Code Issues:**
- send-ticket-email function: `/supabase/functions/send-ticket-email/index.ts`
- mollie-webhook function: `/supabase/functions/mollie-webhook/index.ts`

**Contact:**
- Email: info@eskiler.be
- Check this document for troubleshooting steps
