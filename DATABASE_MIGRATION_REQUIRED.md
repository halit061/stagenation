# ⚠️ Database Migration Required

## Quick Fix for "poster_thumb_url column not found" Error

### 1. Apply the SQL Migration (5 minutes)

**Open Supabase SQL Editor:**
1. Go to: https://supabase.com/dashboard/project/zmoorddmgtkynvvthdod/sql
2. Click **"New Query"**
3. Copy ALL contents from `MIGRATION_add_event_images.sql`
4. Paste and click **"Run"**

The migration adds:
- `poster_url`, `poster_thumb_url`, `poster_updated_at` to events table (all nullable)
- New `event_logos` table for multiple logos per event
- RLS policies for security

### 2. Verify Success

After running the migration, the last query will show:
```
✓ poster_url
✓ poster_thumb_url
✓ poster_updated_at
```

### 3. Refresh and Test

1. Hard refresh your browser (Ctrl+Shift+R / Cmd+Shift+R)
2. Go to SuperAdmin → Events → Create New Event
3. The poster upload section should now work without errors

## Why This Was Needed

The SuperAdmin backend now includes:
- Event poster upload functionality (drag & drop, preview, auto-optimize)
- Multiple event logos support (sponsors, partners, organizers)
- All fields are nullable so event creation succeeds even if uploads fail

## Files Updated

Frontend changes (already deployed):
- ✅ SuperAdmin UI with better contrast/readability
- ✅ Event poster upload UI
- ✅ Event logos upload UI (multiple with labels & ordering)
- ✅ Website header/footer updates (Instagram, phone, partner logos)
- ✅ Menu label changed from "Foto's" to "Media"

Database changes (needs manual application):
- ⚠️ Run `MIGRATION_add_event_images.sql` in Supabase SQL Editor

## Need Help?

See `APPLY_MIGRATION_INSTRUCTIONS.md` for detailed step-by-step instructions.
