# Browser Verification Guide - Authorization Header Check

## How to Verify the Fix is Working

### Step 1: Open Browser DevTools
Press `F12` or right-click → Inspect

### Step 2: Go to Network Tab
Click the "Network" tab in DevTools

### Step 3: Enable "Preserve log" (Optional but Recommended)
Check the "Preserve log" checkbox to keep history

### Step 4: Clear Network Log
Click the clear icon (🚫) to start fresh

---

## Test 1: Send Guest Ticket

### Action:
1. Login as SuperAdmin
2. Navigate to SuperAdmin panel
3. Click "Guest Tickets" tab
4. Click "Verstuur Guest Ticket"
5. Fill form:
   - Event: Select an event
   - Ticket Type: Select a type
   - Email: test@example.com
   - Name: Test User
6. Click Submit

### What to Look For in Network Tab:

#### Find the Request:
Look for: `send-guest-ticket`

#### Click on it and check:

**1. Request Headers (should include):**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzM2NjMxMjAwLCJpYXQiOjE3MzY2Mjc2MDAsImlzcyI6Imh0dHBzOi8vW3lvdXItcHJvamVjdF0uc3VwYWJhc2UuY28vYXV0aC92MSIsInN1YiI6IjEyMzQ1Njc4OSIsImVtYWlsIjoidXNlckBleGFtcGxlLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7fSwidXNlcl9tZXRhZGF0YSI6e30sInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
Content-Type: application/json
```

**2. Status Code (should be):**
```
Status: 200 OK
```

**3. Response Body (should contain):**
```json
{
  "ok": true,
  "message": "Guest ticket sent successfully",
  "order_id": "...",
  "ticket_id": "...",
  "email_id": "..."
}
```

### If You See 401:
**Response Body:**
```json
{
  "ok": false,
  "error": "missing_auth"
}
```
or
```json
{
  "ok": false,
  "error": "invalid_token"
}
```

**This means:**
- Authorization header is missing OR
- Token is invalid/expired

**Fix:** Logout and login again

---

## Test 2: Resend Ticket Email

### Action:
1. Login as SuperAdmin or Admin
2. Navigate to Orders page
3. Find an order with status "paid"
4. Click "Resend Email" button

### What to Look For in Network Tab:

#### Find the Request:
Look for: `send-ticket-email`

#### Click on it and check:

**1. Request Headers (should include):**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (for fetch requests)
```

**2. Status Code (should be):**
```
Status: 200 OK
```

**3. Response Body (should contain):**
```json
{
  "ok": true,
  "message": "Tickets sent successfully",
  "recipient": "customer@example.com",
  "ticketCount": 2,
  "type": "tickets"
}
```

---

## Common Issues and Solutions

### Issue 1: No Authorization Header in Request
**Symptoms:**
- Network tab shows request but no Authorization header
- Response: 401 with "missing_auth"

**Cause:**
- User not logged in
- Session expired

**Solution:**
1. Logout
2. Login again
3. Try again

---

### Issue 2: Authorization Header Present but Still 401
**Symptoms:**
- Network tab shows Authorization header
- Response: 401 with "invalid_token"

**Cause:**
- Token expired
- Token malformed

**Solution:**
1. Hard refresh page (Ctrl+Shift+R or Cmd+Shift+R)
2. Logout
3. Login again
4. Try again

---

### Issue 3: Getting 403 Instead of 401
**Symptoms:**
- Network tab shows Authorization header
- Response: 403 with "Insufficient permissions"

**This is CORRECT behavior!**
- User is authenticated (token is valid)
- But lacks SuperAdmin or Admin role

**Solution:**
- Login with SuperAdmin or Admin account
- OR grant current user the required role

---

### Issue 4: Request Not Appearing in Network Tab
**Symptoms:**
- Click button but nothing happens
- No request in Network tab

**Possible Causes:**
1. JavaScript error (check Console tab)
2. Button event not firing
3. Validation failed before request

**Solution:**
1. Check Console tab for errors
2. Check if alert appears ("Niet ingelogd. Log opnieuw in.")
3. If alert appears, login again

---

## Screenshot Guide

### What a SUCCESSFUL Request Looks Like:

```
Request URL: https://[project].supabase.co/functions/v1/send-guest-ticket
Request Method: POST
Status Code: 200 OK

Request Headers:
  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  Content-Type: application/json

Response Headers:
  Access-Control-Allow-Origin: *
  Content-Type: application/json

Response Body:
{
  "ok": true,
  "message": "Guest ticket sent successfully",
  ...
}
```

### What a FAILED Request Looks Like (401):

```
Request URL: https://[project].supabase.co/functions/v1/send-guest-ticket
Request Method: POST
Status Code: 401 Unauthorized

Request Headers:
  [Missing Authorization header!]
  Content-Type: application/json

Response Body:
{
  "ok": false,
  "error": "missing_auth"
}
```

---

## Quick Checklist

Before reporting an issue, verify:

- [ ] User is logged in (check localStorage for supabase session)
- [ ] Authorization header is present in Network tab
- [ ] Token looks valid (long JWT string)
- [ ] Status code is 200 (not 401, 403, 500)
- [ ] Response body contains `"ok": true`
- [ ] No errors in Console tab

---

## Advanced: Copy as cURL

You can copy the request as cURL to test manually:

1. Right-click on request in Network tab
2. Select "Copy" → "Copy as cURL"
3. Paste in terminal to test

Example:
```bash
curl 'https://[project].supabase.co/functions/v1/send-guest-ticket' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -H 'Content-Type: application/json' \
  --data-raw '{"event_id":"123","ticket_type_id":"456",...}'
```

This is useful for debugging outside the browser.

---

## Success Criteria

✅ Authorization header visible in Network tab
✅ HTTP 200 status code
✅ Response body: `{ "ok": true, ... }`
✅ No errors in Console tab
✅ Email sent successfully
✅ Success alert appears

If all above are true, the fix is working correctly!
