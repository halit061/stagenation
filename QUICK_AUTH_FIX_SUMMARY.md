# Quick Auth Fix Summary

## Problem
HTTP 401 errors on `send-guest-ticket` and `send-ticket-email` edge functions.

## Root Cause
Edge functions used service role client to validate user tokens (incorrect).

## Solution
Use **AUTH client** (anon key + forwarded header) for validation, **ADMIN client** (service role) for DB.

---

## Code Changes

### Edge Function Pattern (Both Functions)

```typescript
// ❌ BEFORE (WRONG)
const supabase = createClient(URL, SERVICE_ROLE_KEY);
const token = authHeader.replace('Bearer ', '');
const { data: { user } } = await supabase.auth.getUser(token);

// ✅ AFTER (CORRECT)
// 1. AUTH client for validation
const authClient = createClient(URL, ANON_KEY, {
  global: { headers: { Authorization: authHeader } }
});
const { data: { user } } = await authClient.auth.getUser();
if (!user) return 401;

// 2. ADMIN client for DB
const adminClient = createClient(URL, SERVICE_ROLE_KEY);
const { data } = await adminClient.from('table')...
```

---

## Frontend Pattern

```typescript
// ❌ BEFORE (WRONG)
await supabase.functions.invoke('function-name', {
  body: data,
});

// ✅ AFTER (CORRECT)
const { data: { session } } = await supabase.auth.getSession();
if (!session?.access_token) {
  alert('Niet ingelogd. Log opnieuw in.');
  return;
}

await supabase.functions.invoke('function-name', {
  body: data,
  headers: {
    Authorization: `Bearer ${session.access_token}`,
  },
});
```

---

## Files Changed

1. `supabase/functions/send-guest-ticket/index.ts`
   - Added AUTH client for validation
   - Added ADMIN client for DB operations
   - All DB calls now use adminClient

2. `supabase/functions/send-ticket-email/index.ts`
   - Added authentication (was completely missing!)
   - Added AUTH client for validation
   - Added ADMIN client for DB operations
   - All DB calls now use adminClient

3. `src/pages/SuperAdmin.tsx`
   - `sendGuestTicket()`: Added session check + Authorization header
   - `resendTicketEmail()`: Added session check + Authorization header

4. `src/pages/Admin.tsx`
   - `handleResendTickets()`: Added session check + Authorization header + apikey

---

## Verification

### In Browser Network Tab (F12):
1. Click on edge function request
2. **Check Request Headers** → Should see:
   ```
   Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
3. **Check Response** → Should be HTTP 200 with `{ ok: true }`

---

## Status Codes

- **200**: Success
- **401**: Missing/invalid auth (`missing_auth`, `invalid_token`)
- **403**: Insufficient permissions (not SuperAdmin/Admin)
- **400**: Validation error
- **500**: Server error

---

## Testing

1. Login as SuperAdmin/Admin
2. Send guest ticket or resend email
3. Should return HTTP 200 (not 401)
4. Email should be sent successfully

---

## Result
✅ Both edge functions now authenticate correctly
✅ HTTP 200 for logged-in SuperAdmin/Admin
✅ Clear error messages for auth failures
✅ Secure separation: AUTH client (validate) vs ADMIN client (DB)
