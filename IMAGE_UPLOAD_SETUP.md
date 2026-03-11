# Event Poster & Logo Upload Setup Guide

This guide explains how to set up and use the new event poster and logo upload functionality for your Eskiler events platform.

## ✅ What's Been Implemented

### 1. Database Schema
- Added `poster_url` and `poster_thumb_url` fields to the `events` table
- Created `event_logos` table for managing multiple logos per event
- Full RLS (Row Level Security) policies in place

### 2. Image Upload System
- Edge function `upload-event-image` that:
  - Validates file types and sizes (max 10MB for posters, 5MB for logos)
  - Auto-resizes images to multiple versions:
    - **Posters**: 1600px (full) and 400px (thumbnail)
    - **Logos**: 600px (normal) and 200px (small)
  - Uploads to Supabase Storage
  - Updates database automatically

### 3. SuperAdmin Interface
- Event creation/editing form now includes:
  - **Poster upload** with live preview
  - File validation (JPG, PNG, WEBP only)
  - Replace/remove functionality
  - Upload happens automatically when saving the event

### 4. Public Display
- **Agenda page** now shows:
  - Event poster thumbnail (400px) if available
  - Falls back to date box if no poster
  - Date badge overlay on posters
  - Smooth hover animations

## 📋 Setup Instructions

### Step 1: Run Database Migration

Open your Supabase SQL Editor and run the migration file:

```bash
# File location:
MIGRATION_add_event_images.sql
```

This will:
- Add poster fields to events table
- Create event_logos table
- Set up RLS policies
- Create indexes

### Step 2: Create Storage Bucket

1. Go to your Supabase Dashboard → **Storage**
2. Click **New bucket**
3. Name it: `event-images`
4. Make it **Public**
5. Click **Create bucket**

### Step 3: Set Storage Policies

In the Storage bucket settings for `event-images`, add these policies:

#### Policy 1: Public Read
```
Policy Name: Public can view event images
Allowed operation: SELECT
Target roles: public
USING expression: true
```

#### Policy 2: Admin Upload
```
Policy Name: Admins can upload event images
Allowed operation: INSERT
Target roles: authenticated
WITH CHECK expression:
(EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['super_admin'::text, 'admin'::text])))))
```

#### Policy 3: Admin Update
```
Policy Name: Admins can update event images
Allowed operation: UPDATE
Target roles: authenticated
USING + WITH CHECK expression:
(EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['super_admin'::text, 'admin'::text])))))
```

#### Policy 4: Admin Delete
```
Policy Name: Admins can delete event images
Allowed operation: DELETE
Target roles: authenticated
USING expression:
(EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['super_admin'::text, 'admin'::text])))))
```

### Step 4: Deploy Edge Function

Deploy the upload edge function to Supabase:

```bash
# The function is located at:
supabase/functions/upload-event-image/index.ts

# Deploy using Supabase CLI or dashboard
```

## 🎨 Using the Poster Upload Feature

### Creating a New Event with a Poster

1. Go to **SuperAdmin** → **Events** tab
2. Click **Nieuw Event**
3. Fill in all event details
4. Scroll down to **Event Poster (Afiche)** section
5. Click the file input or drag & drop an image
6. Preview will show immediately
7. Click **Aanmaken** to save
8. The poster will be uploaded and optimized automatically

### Editing an Event's Poster

1. Go to **SuperAdmin** → **Events** tab
2. Click the edit icon on any event
3. If the event has a poster, it will show in the form
4. To replace: Click the file input and select a new image
5. To remove: Click the red trash icon on the preview
6. Click **Bijwerken** to save changes

### Poster Requirements

- **Formats**: JPG, PNG, or WEBP
- **Max size**: 10MB
- **Recommended dimensions**: 1600x900px (16:9 ratio) or higher
- **Optimization**: Images are automatically resized and compressed

## 🎭 How It Appears on the Frontend

### Agenda Page
- Events **with posters**:
  - Show 400px wide thumbnail
  - Date badge overlay in top-left corner
  - Smooth hover zoom effect
  - Professional nightlife aesthetic

- Events **without posters**:
  - Show traditional date box (32px width)
  - Gradient background
  - No visual disruption

### Future Features (Logo Support)

The foundation for logos is ready:
- Multiple logos per event
- Label support (Organiser, Sponsor, Partner)
- Display order management
- Same upload/resize system

To implement:
1. Add logo management UI to SuperAdmin
2. Display logos on event detail pages
3. Responsive grid layout

## 🔧 Technical Details

### File Structure

```
src/
├── components/
│   └── ImageUpload.tsx          # Reusable upload component
├── lib/
│   └── imageUpload.ts           # Upload helper functions
└── pages/
    ├── SuperAdmin.tsx           # Admin form with upload
    └── Agenda.tsx               # Public display with posters

supabase/
├── functions/
│   └── upload-event-image/
│       └── index.ts             # Image processing edge function
└── migrations/
    └── [migration file]         # Database schema
```

### Storage Structure

```
event-images/
└── events/
    └── {eventId}/
        ├── poster.jpg           # Full size poster (1600px)
        ├── poster_thumb.jpg     # Thumbnail (400px)
        └── logos/
            ├── {logoId}.png     # Full logo (600px)
            └── {logoId}_thumb.png # Small logo (200px)
```

### Security

- ✅ Only admins can upload images
- ✅ File type validation (client & server)
- ✅ File size limits enforced
- ✅ All images optimized and compressed
- ✅ Public read access for display
- ✅ RLS policies on all tables

## 🐛 Troubleshooting

### Uploads Failing
- Check that the `event-images` bucket exists
- Verify storage policies are configured
- Ensure edge function is deployed
- Check browser console for errors

### Images Not Displaying
- Verify poster_url is saved in database
- Check image URL is publicly accessible
- Clear browser cache
- Inspect network tab for 403/404 errors

### Image Quality Issues
- Upload higher resolution source images
- Use JPG for photos, PNG for graphics
- Avoid uploading pre-compressed images
- Let the system handle optimization

## 📊 Benefits

1. **Professional Look**: Events stand out with visual posters
2. **Automatic Optimization**: No manual image editing needed
3. **Fast Loading**: Thumbnails keep page load times low
4. **Consistent Branding**: Uniform sizing across all events
5. **Easy Management**: Upload directly in admin panel
6. **Scalable**: Ready for logos, galleries, and more

## 🚀 Next Steps

To add logo support:
1. Create logo management UI in SuperAdmin
2. Add logo display to event detail pages
3. Implement drag-and-drop reordering
4. Add logo editing/replacement

To enhance further:
- Add image cropping tool
- Support for multiple event images (gallery)
- Automatic social media previews
- CDN integration for faster delivery

---

**Questions or Issues?**
Check the edge function logs in Supabase Dashboard → Edge Functions → Logs
