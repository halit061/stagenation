# Poster Upload Diagnostics & Testing Guide

## Overview
The poster upload system now includes comprehensive diagnostics to identify and report issues clearly.

## Changes Made

### 1. Storage Health Check Edge Function
**Function:** `storageHealthCheck`
**URL:** `https://[your-supabase-url]/functions/v1/storageHealthCheck`

**Purpose:**
- Checks if environment variables are configured
- Verifies storage bucket access
- Lists all available buckets
- Confirms "event-images" bucket exists

**Response Format:**
```json
{
  "ok": true,
  "supabaseUrl": "https://...",
  "hasServiceKey": true,
  "buckets": ["event-images", "other-bucket"],
  "hasEventImagesBucket": true,
  "message": "Storage is healthy"
}
```

### 2. Automatic Health Check Before Upload
The upload now automatically runs a health check BEFORE attempting to upload files. This provides immediate feedback if there are configuration issues.

### 3. Detailed Error Messages
Error messages now include:
- HTTP status code
- Service key presence
- Available buckets list
- Specific error details from the edge function
- Error code for debugging

## Testing the System

### Test 1: Health Check (Browser Console)

Open browser console in SuperAdmin and run:

```javascript
// Test health check
fetch('https://[YOUR-SUPABASE-URL]/functions/v1/storageHealthCheck', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: '{}'
})
.then(r => r.json())
.then(data => {
  console.log('Health Check Result:', data);
  if (data.ok && data.hasEventImagesBucket) {
    console.log('✅ Storage is ready for uploads');
  } else {
    console.error('❌ Storage issues detected:', data);
  }
});
```

**Expected Result:**
```json
{
  "ok": true,
  "hasServiceKey": true,
  "buckets": ["event-images"],
  "hasEventImagesBucket": true,
  "message": "Storage is healthy"
}
```

### Test 2: Upload a Poster

1. Go to SuperAdmin → Events tab
2. Click "Event Toevoegen" or edit an existing event
3. Select a poster image (JPG, PNG, or WEBP, max 10MB)
4. Click "Aanmaken" or "Bijwerken"

**If upload fails**, the error message will show:
- Status code
- Whether service key is present
- List of available buckets
- Whether event-images bucket exists
- Specific error details

### Test 3: Check Browser Console

After upload attempt, check browser console for:
```
[uploadEventImage] Starting upload: {...}
[uploadEventImage] Running storage health check...
[uploadEventImage] Health check result: {...}
[uploadEventImage] File converted to base64
[callEdge] Calling edge function: upload-event-image
[uploadEventImage] Upload successful: {...}
```

## Troubleshooting

### Error: "Storage not ready"
**Symptoms:**
```
Storage not ready:
Status: 500
Has Service Key: No
Buckets: None
Event-images bucket: MISSING
```

**Solution:**
The storage bucket was created via migration. If this error appears, the migration may not have run successfully. Check:
1. Run the migration again: `20251226150946_create_event_images_storage_bucket.sql`
2. Verify bucket exists in Supabase dashboard → Storage
3. Check RLS policies are active

### Error: "Failed to list buckets"
**Symptoms:**
```
Has Service Key: Yes
Buckets: None
Error: Failed to list buckets: [details]
```

**Solution:**
This indicates the service role key has issues accessing storage. This should not happen in Supabase's hosted environment. Contact support if this persists.

### Error: "INVALID_JWT" or "SESSION_EXPIRED"
**Symptoms:**
```
Code: INVALID_JWT
Status: 401
```

**Solution:**
1. Refresh the page
2. Log out and log back in
3. The system will automatically try to refresh the token once

### Error: "FORBIDDEN" or "Insufficient permissions"
**Symptoms:**
```
Status: 403
Error: Insufficient permissions
Details: admin or super_admin role required
```

**Solution:**
Your user account doesn't have admin privileges. Check `user_roles` table:
```sql
SELECT * FROM user_roles WHERE user_id = '[your-user-id]';
```

## Edge Functions Overview

### 1. storageHealthCheck (NEW)
- **Purpose:** Diagnose storage configuration issues
- **JWT Required:** No (public diagnostic)
- **Method:** POST
- **Returns:** Storage status and bucket list

### 2. upload-event-image
- **Purpose:** Upload event posters and logos
- **JWT Required:** Yes (admin only)
- **Method:** POST
- **Body:**
  ```json
  {
    "eventId": "uuid",
    "imageType": "poster" | "logo",
    "imageData": "base64-string",
    "fileName": "poster.jpg",
    "logoLabel": "optional"
  }
  ```

## Verification Checklist

Before going live, verify:

- [ ] Health check returns `ok: true`
- [ ] Health check shows `hasEventImagesBucket: true`
- [ ] Health check lists `event-images` in buckets array
- [ ] Can upload a test poster without errors
- [ ] Uploaded poster displays correctly
- [ ] Error messages show detailed diagnostics
- [ ] Browser console shows complete upload flow

## Success Indicators

When everything is working correctly:

1. **Health Check:**
   - ✅ `ok: true`
   - ✅ `hasServiceKey: true`
   - ✅ `hasEventImagesBucket: true`
   - ✅ Buckets array contains "event-images"

2. **Upload:**
   - ✅ No errors in browser console
   - ✅ Upload progress indicator shows
   - ✅ Poster preview displays after upload
   - ✅ Database `events` table shows poster_url filled
   - ✅ Image is accessible at the public URL

3. **Error Handling:**
   - ✅ Clear error messages if upload fails
   - ✅ Event still saves even if poster upload fails
   - ✅ Can retry poster upload via Edit button

## Support

If issues persist after following this guide:
1. Check browser console for detailed error logs
2. Run health check and save the output
3. Check Supabase Edge Function logs for the upload-event-image function
4. Verify the migration `20251226150946_create_event_images_storage_bucket.sql` was applied successfully
