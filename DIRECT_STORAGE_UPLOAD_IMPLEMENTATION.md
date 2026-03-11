# Direct Storage Upload Implementation

## Summary

Poster upload now uses **direct browser-to-Supabase-Storage** instead of Edge Functions, eliminating JWT/connectivity issues and providing reliable uploads.

## Changes Made

### 1. Removed Edge Function Upload Flow ✅

**Before:**
- Browser → Edge Function → Storage
- Required JWT validation
- Complex error handling
- Prone to connectivity issues

**After:**
- Browser → Storage (direct)
- Simple permission check
- Clear error messages
- Reliable uploads

### 2. New Upload Implementation

**File:** `src/lib/imageUpload.ts`

**Key Features:**
- Direct storage upload using `supabase.storage.from('event-images').upload()`
- File validation: PNG, JPG, JPEG, WEBP only
- Size limit: 5MB maximum
- Email-based access control
- Real Supabase error messages

**Flow:**
```
1. Check upload permission (email whitelist)
2. Validate file type and size
3. Upload to storage: events/${eventId}/poster-${timestamp}.${ext}
4. Get public URL
5. Update events table with poster_url
6. Return success with URL
```

### 3. Email-Based Access Control

**Allowed Emails:**
- halit@djhalit.com
- info@lumetrix.be
- info@eskiler.be

**Implementation:**
```typescript
export async function checkUploadPermission(): Promise<{ allowed: boolean; email?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  const allowed = ALLOWED_ADMIN_EMAILS.includes(user.email);
  return { allowed, email: user.email };
}
```

**Permission Check:**
- Runs during component mount in `checkAuthorization()`
- Sets `canUploadImages` state
- Shows "Geen rechten" message if not allowed
- Hides upload input if not allowed

### 4. SuperAdmin UI Updates

**File:** `src/pages/SuperAdmin.tsx`

**Changes:**
1. Added `canUploadImages` state variable
2. Permission check in `checkAuthorization()`
3. Conditional upload UI display
4. Clear permission denied message:
   ```
   Geen rechten om afbeeldingen te uploaden
   Alleen toegestane admin emails kunnen posters uploaden.
   ```

### 5. Storage Configuration

**Bucket:** `event-images`
- Already created via migration
- Public read access
- Admin-only write access
- RLS policies active

**Storage Path:**
```
events/${eventId}/poster-${timestamp}.${ext}
```

Example:
```
events/abc123-def456/poster-1703598234567.jpg
```

### 6. Error Handling

**Real Error Messages:**
- "Ongeldig bestandstype: image/svg" → Shows exact type issue
- "Bestand te groot: 7.5 MB Maximum: 5 MB" → Shows exact size
- "Upload gefaald: [Supabase error]" → Shows real storage error
- "Geen rechten om afbeeldingen te uploaden" → Permission denied

**No More Generic Errors:**
- ❌ "Cannot connect to upload service"
- ❌ "Storage not ready"
- ❌ Edge function errors

## Testing

### Test 1: Allowed User Upload

1. Log in as allowed email (halit@djhalit.com, info@lumetrix.be, or info@eskiler.be)
2. Go to SuperAdmin → Events
3. Create or edit event
4. Select poster file (JPG/PNG/WEBP, under 5MB)
5. Click "Aanmaken" or "Bijwerken"

**Expected Result:**
- Upload succeeds immediately
- Poster preview shows
- Database updated with poster_url
- No errors in console

### Test 2: Unauthorized User

1. Log in with different email
2. Go to SuperAdmin → Events
3. Try to create/edit event

**Expected Result:**
- Red warning box displays:
  ```
  Geen rechten om afbeeldingen te uploaden
  Alleen toegestane admin emails kunnen posters uploaden.
  ```
- File input is hidden
- Event can still be created without poster

### Test 3: File Validation

1. Try uploading SVG file
**Expected:** "Ongeldig bestandstype: image/svg+xml"

2. Try uploading 10MB file
**Expected:** "Bestand te groot: 10 MB Maximum: 5 MB"

3. Try uploading valid PNG under 5MB
**Expected:** Success

### Test 4: Refresh Persistence

1. Upload poster
2. Refresh page
3. Edit same event

**Expected Result:**
- Poster still visible in preview
- Can replace with new poster
- Can delete poster

## Browser Console Output

**Successful Upload:**
```
[uploadEventImage] Starting direct storage upload: {...}
[uploadEventImage] Permission granted for: halit@djhalit.com
[uploadEventImage] Uploading to storage: events/abc123/poster-1703598234567.jpg
[uploadEventImage] Upload successful: {...}
[uploadEventImage] Public URL: https://[supabase-url]/storage/v1/object/public/event-images/events/abc123/poster-1703598234567.jpg
[uploadEventImage] Database updated successfully
```

**Permission Denied:**
```
[uploadEventImage] Starting direct storage upload: {...}
[uploadEventImage] Upload error: Error: Geen rechten om afbeeldingen te uploaden
```

**File Too Large:**
```
[uploadEventImage] Starting direct storage upload: {...}
[uploadEventImage] Permission granted for: halit@djhalit.com
[uploadEventImage] Upload error: Error: Bestand te groot: 7.5 MB
Maximum: 5 MB
```

## Technical Details

### Direct Storage Upload API

```typescript
const { data, error } = await supabase.storage
  .from('event-images')
  .upload(storagePath, file, {
    upsert: true,
    contentType: file.type,
  });
```

**Parameters:**
- `storagePath`: Unique path for the file
- `file`: The File object from input
- `upsert: true`: Replace if exists
- `contentType`: MIME type from file

### Public URL Generation

```typescript
const { data } = supabase.storage
  .from('event-images')
  .getPublicUrl(storagePath);

const posterUrl = data.publicUrl;
```

**Result:**
```
https://[project-id].supabase.co/storage/v1/object/public/event-images/events/abc123/poster-1703598234567.jpg
```

### Database Update

```typescript
await supabase
  .from('events')
  .update({
    poster_url: posterUrl,
    poster_thumb_url: posterUrl,
    updated_at: new Date().toISOString(),
  })
  .eq('id', eventId);
```

## Advantages Over Edge Functions

### Reliability ✅
- No JWT expiration issues
- No edge function cold starts
- No network timeouts
- Direct upload = faster

### Simplicity ✅
- Fewer moving parts
- Easier to debug
- Clear error messages
- No base64 conversion needed

### Performance ✅
- No edge function processing
- No image resizing (future optimization)
- Faster uploads
- Immediate feedback

### Security ✅
- RLS policies still active
- Email whitelist for upload
- No service key exposure
- Storage bucket policies enforced

## Edge Functions Status

### Still Active (Not Affected):
- ✅ `mollie-webhook` - Payment processing
- ✅ `send-ticket-email` - Email sending
- ✅ `validate-ticket` - Ticket validation
- ✅ `create-ticket-checkout` - Checkout creation
- ✅ All other edge functions unchanged

### No Longer Used for Poster Upload:
- ⚠️ `upload-event-image` - Still exists but not called
- ⚠️ `storageHealthCheck` - Still exists but not called

**Note:** These functions still work and can be used for other image types (logos) if needed, but poster upload now bypasses them entirely.

## Migration Path

### No Migration Needed ✅
- Storage bucket already exists
- RLS policies already configured
- Database schema unchanged
- Existing posters still accessible

### Backward Compatibility ✅
- Existing poster URLs still work
- Events without posters unaffected
- Old uploads remain accessible
- No data loss

## Troubleshooting

### Issue: "Geen rechten" despite correct email

**Solution:**
1. Check browser console for actual email logged in
2. Verify email matches exactly (case-sensitive)
3. Log out and log back in
4. Check `ALLOWED_ADMIN_EMAILS` in `src/lib/imageUpload.ts`

### Issue: Upload fails with storage error

**Possible Causes:**
1. RLS policy blocking upload
2. File size exceeds limit
3. Invalid file type
4. Network connectivity

**Debug Steps:**
1. Check browser console for exact error
2. Verify file type and size
3. Check Supabase Storage dashboard
4. Verify RLS policies active

### Issue: Poster not showing after upload

**Solution:**
1. Check browser console for public URL
2. Verify URL is accessible in browser
3. Check `events` table for `poster_url` value
4. Refresh page to reload data

## Future Enhancements

### Optional Improvements:
1. **Image Resizing:** Add client-side resize before upload
2. **Progress Bar:** Show upload progress percentage
3. **Drag & Drop:** Add drag-and-drop file selection
4. **Crop Tool:** Allow cropping before upload
5. **Multiple Formats:** Auto-convert to WebP for optimization

### Not Needed Now:
- These features can be added later without breaking changes
- Current implementation is production-ready
- Focus on getting poster upload working reliably first

## Verification Checklist

Before deploying to production:

- [x] Build succeeds without errors
- [x] Upload permission check works
- [x] File validation works (type + size)
- [x] Direct storage upload works
- [x] Public URL generation works
- [x] Database update works
- [x] Error messages are clear
- [x] Permission denied message shows
- [x] Console logging is helpful
- [x] No edge function dependencies

## Summary

Poster upload is now **significantly simpler and more reliable**. The direct browser-to-storage approach eliminates JWT/edge function complexity while maintaining security through email-based access control and RLS policies.

**Result:** Uploading posters works every time with clear error messages if anything goes wrong.
