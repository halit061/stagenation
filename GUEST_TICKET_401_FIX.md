# Guest Ticket 401 Unauthorized - FIX COMPLETE

## Root Cause
The frontend was not explicitly passing the authenticated user's access token in the Authorization header when calling the `send-guest-ticket` edge function.

## Solution
Updated the frontend to explicitly retrieve the user's session and pass the `Authorization: Bearer <access_token>` header.

---

## Changes Made

### File: `/src/pages/SuperAdmin.tsx`

**Function:** `sendGuestTicket()`

**Before:**
```typescript
const { data, error } = await supabase.functions.invoke('send-guest-ticket', {
  body: guestTicketForm,
});
```

**After:**
```typescript
const { data: { session } } = await supabase.auth.getSession();
if (!session?.access_token) {
  alert('Niet ingelogd. Log opnieuw in.');
  return;
}

const { data, error } = await supabase.functions.invoke('send-guest-ticket', {
  body: guestTicketForm,
  headers: {
    Authorization: `Bearer ${session.access_token}`,
  },
});
```

---

## How It Works

1. **Frontend:**
   - Gets current session: `supabase.auth.getSession()`
   - Validates session exists with access token
   - Passes `Authorization: Bearer <token>` header explicitly
   - Shows error if not logged in

2. **Edge Function:**
   - Reads `Authorization` header from request
   - Extracts token: `token.replace('Bearer ', '')`
   - Validates token: `supabase.auth.getUser(token)`
   - Checks user role: SuperAdmin or Admin
   - Returns 401 if unauthorized, 403 if insufficient permissions

---

## HTTP Status Codes

- **200** - Success (guest ticket sent)
- **400** - Missing required fields
- **401** - Missing/invalid Authorization header or invalid token
- **403** - Insufficient permissions (not SuperAdmin/Admin)
- **404** - Event or ticket type not found
- **500** - Server error (order/ticket creation or email failure)

---

## Testing

### Test 1: Send Guest Ticket (Authenticated)
1. Login as SuperAdmin or Admin
2. Navigate to SuperAdmin > Guest Tickets
3. Click "Verstuur Guest Ticket"
4. Fill form and submit
5. **Expected:** HTTP 200, success message, email sent

### Test 2: Send Guest Ticket (Not Logged In)
1. Clear session/logout
2. Try to send guest ticket
3. **Expected:** Alert "Niet ingelogd. Log opnieuw in."

### Test 3: Send Guest Ticket (Invalid Role)
1. Login as Organizer or Scanner
2. Try to access Guest Tickets section
3. **Expected:** HTTP 403 (caught by edge function role check)

---

## No Other Changes
- Edge function logic unchanged
- Database schema unchanged
- Email sending unchanged
- Scanner compatibility unchanged
- All other functionality intact

---

## Build Status
✅ Build successful
✅ No TypeScript errors
✅ Ready for deployment

---

## Conclusion
The 401 Unauthorized error is now resolved. The frontend explicitly passes the user's access token, and the edge function correctly validates it before processing the request.
