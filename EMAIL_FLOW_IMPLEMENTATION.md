# Email Flow Implementation - Complete

## Overview
Automatic ticket email sending has been successfully implemented. After a successful payment (order.status = 'paid'), customers will automatically receive an email with their tickets and QR codes.

## Implementation Summary

### 1. Database Changes (✓ Complete)
Added three new fields to the `orders` table:
- `email_sent` (boolean, default false) - Tracks if ticket email was sent
- `email_sent_at` (timestamptz, nullable) - Timestamp when email was sent
- `email_error` (text, nullable) - Stores any email sending errors

Migration file: `add_order_email_tracking.sql`

### 2. Edge Function (✓ Complete)
Updated `send-ticket-email` Edge Function with:
- QR code generation using qr_data, token, or id as fallback
- Resend API integration for email sending
- HTML email template with event details and multiple tickets
- Email subject format: "Jouw tickets voor {event.name} – Order #{order.number}"
- Error logging to orders.email_error field
- Duplicate email prevention (checks email_sent flag)
- Resend capability (when resend=true parameter is passed)

Location: `/supabase/functions/send-ticket-email/index.ts`

### 3. Payment Webhook (✓ Complete)
The Mollie webhook automatically triggers the email function after successful payment:
- Located in: `/supabase/functions/mollie-webhook/index.ts` (lines 68-75)
- Calls send-ticket-email Edge Function when payment.status = 'paid'
- Handles errors gracefully without blocking payment processing

### 4. SuperAdmin Interface (✓ Complete)
Added new "Orders" tab in SuperAdmin with:
- List of all orders with status and email tracking
- Visual indicators for:
  - Order status (paid/pending/failed)
  - Email sent status (✓ Email Verstuurd)
  - Email errors (✗ Email Error)
- "Resend Email" button for paid orders
- Order details including customer info, event, amount, and timestamps
- Email error messages displayed when present

Access: `/superadmin.html` → Orders tab

## Configuration Required

### IMPORTANT: Resend API Key
Before the email flow will work, you MUST configure the Resend API key:

1. Get your Resend API key:
   - Sign up at https://resend.com
   - Get your API key from the dashboard

2. Add to Supabase Edge Function secrets:
   ```bash
   supabase secrets set RESEND_API_KEY=re_YOUR_API_KEY
   ```

3. Optional: Configure email sender:
   ```bash
   supabase secrets set EMAIL_FROM="Your Name <noreply@yourdomain.com>"
   ```
   Default: "Eskiler Tickets <info@eskiler.be>"

## Testing Instructions

### Test 1: Automatic Email After Payment
1. Create a test order through the website
2. Complete payment (use Mollie test mode)
3. Check that:
   - Order status changes to 'paid' in database
   - Email is automatically sent to customer
   - orders.email_sent = true
   - orders.email_sent_at is set

### Test 2: Resend Email via SuperAdmin
1. Log in to SuperAdmin (`/superadmin.html`)
2. Go to Orders tab
3. Find a paid order
4. Click "Resend Email" button
5. Confirm the action
6. Verify email is sent again

### Test 3: Email Content Verification
Check that the email contains:
- Event name, location, date, and time
- Order number and customer details
- All tickets with individual QR codes
- Ticket holder name and email per ticket
- Important notice about scanning at entrance

### Test 4: Error Handling
1. Temporarily set wrong RESEND_API_KEY
2. Trigger a payment
3. Check SuperAdmin Orders tab shows email error
4. Fix the API key
5. Use "Resend Email" button to retry

## Email Features

### Content
- Professional HTML email template
- Event details (location, date, time)
- Order summary
- Individual ticket cards with:
  - Ticket type and number
  - Holder name and email
  - QR code (300x300px, base64 embedded)
- Important scanning instructions
- Contact information

### QR Code Generation
- Uses ticket.qr_data if available
- Falls back to ticket.token
- Falls back to ticket.id as last resort
- Generated server-side as base64 data URL
- Embedded directly in email (no external dependencies)

### Multiple Tickets
- One email per order
- All tickets included in single email
- Each ticket has its own QR code
- Clear separation between tickets

## Monitoring & Debugging

### Check Email Status
```sql
-- View orders with email status
SELECT
  order_number,
  status,
  payer_email,
  email_sent,
  email_sent_at,
  email_error,
  created_at,
  paid_at
FROM orders
WHERE status = 'paid'
ORDER BY created_at DESC;
```

### Find Failed Emails
```sql
-- Orders with email errors
SELECT
  order_number,
  payer_email,
  email_error,
  created_at
FROM orders
WHERE email_error IS NOT NULL
ORDER BY created_at DESC;
```

### Unsent Emails
```sql
-- Paid orders without email sent
SELECT
  order_number,
  payer_email,
  status,
  paid_at
FROM orders
WHERE status = 'paid'
AND (email_sent IS NULL OR email_sent = false)
ORDER BY paid_at DESC;
```

## Edge Function Logs
View logs in Supabase Dashboard:
1. Go to Edge Functions section
2. Select `send-ticket-email` function
3. View logs for success/error messages

## Troubleshooting

### Email Not Sending
1. Check RESEND_API_KEY is configured correctly
2. Check Edge Function logs for errors
3. Verify Resend account is active and not rate-limited
4. Check orders.email_error field for specific error message

### Wrong Email Content
1. Verify event data is correct in database
2. Check ticket status is 'valid'
3. Ensure ticket_types are properly linked

### Duplicate Emails
- System prevents duplicates automatically
- email_sent flag must be false for email to send
- Use resend=true parameter to force resend

## Security Notes

- RESEND_API_KEY is stored securely in Edge Function environment
- Service role key is used server-side only
- Emails sent through Resend's secure API
- QR codes generated server-side
- No sensitive data in client-side code

## Success Criteria (All ✓)

- [✓] Email tracking fields added to orders table
- [✓] Edge Function sends emails with Resend API
- [✓] QR codes generated and embedded in email
- [✓] Multiple tickets in one email
- [✓] Automatic sending after payment
- [✓] SuperAdmin resend functionality
- [✓] Error tracking and logging
- [✓] Duplicate prevention
- [✓] Professional HTML email template

## Next Steps

1. **Configure Resend API Key** (REQUIRED)
2. Test with real payment in test mode
3. Verify email delivery to actual inbox
4. Check spam score and deliverability
5. Monitor Edge Function logs for any issues
6. Consider adding email delivery tracking (opens, clicks)

## Support

For issues or questions:
- Check Edge Function logs in Supabase Dashboard
- Review orders.email_error field for specific errors
- Use SuperAdmin Orders tab to monitor email status
- Test resend functionality for failed emails
