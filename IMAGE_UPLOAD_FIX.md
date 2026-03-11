# Image Upload Fix - "Failed to Fetch" Error

## Problem
When uploading event posters in SuperAdmin, you're seeing:
```
Waarschuwing: Event opgeslagen maar poster upload gefaald: Failed to fetch
```

## Root Cause
The "Failed to fetch" error means the edge function call isn't reaching the server. This is typically caused by:

### 1. Edge Function Not Deployed
The `upload-event-image` edge function exists locally but may not be deployed to your Supabase project.

### 2. Storage Bucket Missing
The edge function requires a storage bucket named `event-images` to exist in your Supabase project.

---

## Fix Steps

### Step 1: Verify Edge Function Deployment

The edge function should be deployed automatically, but you can verify:

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project: `zmoorddmgtkynvvthdod`
3. Navigate to **Edge Functions** in the left sidebar
4. Check if `upload-event-image` is listed and deployed

### Step 2: Create Storage Bucket

The edge function needs a storage bucket called `event-images`. To create it:

1. Go to your Supabase Dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **New Bucket**
4. Enter bucket name: `event-images`
5. Set as **Public bucket** (check the box)
6. Click **Create bucket**

#### Bucket Configuration:
- **Name:** `event-images`
- **Public:** Yes (images need to be publicly accessible)
- **File size limit:** 10MB (optional but recommended)
- **Allowed MIME types:** `image/*` (optional)

### Step 3: Set Bucket Policies

After creating the bucket, set up the following policies:

**Storage Policy for Admins to Upload:**
```sql
CREATE POLICY "Admins can upload event images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-images'
  AND (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  )
);
```

**Storage Policy for Admins to Update:**
```sql
CREATE POLICY "Admins can update event images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'event-images'
  AND (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  )
);
```

**Storage Policy for Public Read:**
```sql
CREATE POLICY "Anyone can view event images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'event-images');
```

### Step 4: Test the Upload

After completing the above steps:

1. Refresh the SuperAdmin page
2. Try uploading an event poster again
3. Check the browser console (F12) for detailed logs
4. The upload should now work

---

## Verification Checklist

- [ ] Edge function `upload-event-image` is deployed
- [ ] Storage bucket `event-images` exists
- [ ] Bucket is set to public
- [ ] Storage policies are created
- [ ] SuperAdmin page reloaded
- [ ] Upload tested and working

---

## Alternative: Direct Storage Upload (Temporary Workaround)

If you need a quick workaround while fixing the edge function, you can temporarily use direct storage upload. However, this won't handle image resizing and thumbnails.

This is NOT recommended for production, as the edge function provides important features like:
- Automatic image resizing
- Thumbnail generation
- Size validation
- Format conversion

---

## Troubleshooting

### Still Getting "Failed to Fetch"?

1. **Check Browser Console:**
   - Open Developer Tools (F12)
   - Go to Console tab
   - Look for detailed error messages
   - Check Network tab for the failed request

2. **Verify Environment Variables:**
   - Ensure `.env` has correct `VITE_SUPABASE_URL`
   - Should be: `https://zmoorddmgtkynvvthdod.supabase.co`

3. **Check Edge Function Logs:**
   - In Supabase Dashboard
   - Go to Edge Functions
   - Click on `upload-event-image`
   - View logs for errors

4. **Test Edge Function Directly:**
   ```bash
   curl -X POST \
     https://zmoorddmgtkynvvthdod.supabase.co/functions/v1/upload-event-image \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"test": true}'
   ```

### Common Issues:

**CORS Error:**
- Edge function already has CORS headers
- If CORS is the issue, check browser console for specific CORS messages

**Authentication Error:**
- Make sure you're logged in as super_admin
- Try logging out and logging back in

**File Too Large:**
- Posters: max 10MB
- Logos: max 5MB
- Compress images before uploading if needed

**Network Timeout:**
- Large files take longer to upload
- Check your internet connection
- Try with a smaller test image first

---

## How the Upload Works

### Process Flow:

1. **User selects image** in SuperAdmin
2. **Frontend** (imageUpload.ts):
   - Converts image to base64
   - Gets user's access token
   - Sends to edge function
3. **Edge Function** (upload-event-image):
   - Validates user permissions
   - Validates file size
   - Resizes image (full size + thumbnail)
   - Uploads to storage bucket
   - Updates database with URLs
4. **Database updated** with poster URLs
5. **User sees** poster on event

### File Structure in Storage:

```
event-images/
├── events/
│   └── {event-id}/
│       ├── poster.jpg          (max 1600px wide)
│       ├── poster_thumb.jpg    (max 400px wide)
│       └── logos/
│           ├── {logo-id}.png        (max 600px wide)
│           └── {logo-id}_thumb.png  (max 200px wide)
```

---

## Enhanced Error Logging

The code has been updated with better error logging. After applying this fix, you'll see more detailed console logs showing:

- Upload URL being used
- File size being uploaded
- Response status
- Detailed error messages
- Specific troubleshooting suggestions

Check the browser console (F12 → Console tab) for these logs when testing.

---

## Success Indicators

When working correctly, you should see:

✅ **In SuperAdmin:**
- Event saved successfully
- Poster preview appears immediately
- No error messages

✅ **In Browser Console:**
```
Uploading to: https://zmoorddmgtkynvvthdod.supabase.co/functions/v1/upload-event-image
File size: 0.85 MB
Upload response status: 200
Upload successful: {fullUrl: "...", thumbUrl: "...", uploadId: "..."}
```

✅ **In Database:**
- Event record has `poster_url` and `poster_thumb_url` populated
- URLs are accessible (clicking opens the image)

✅ **On Frontend:**
- Event appears in Agenda with poster image
- Poster loads quickly (thumbnail used in listings)
- Full size image loads when needed

---

## Contact Support

If you've followed all steps and still have issues:

1. Check Supabase Dashboard for any service outages
2. Review edge function logs for errors
3. Verify your Supabase project is active and not paused
4. Contact Supabase support if it appears to be a platform issue

---

## Summary

**Most Common Fix:**
1. Create storage bucket: `event-images` (public)
2. Add storage policies (see Step 3)
3. Refresh SuperAdmin page
4. Try upload again

**Time to Fix:** 5 minutes

**Difficulty:** Easy (just need to create bucket and policies)
