# Apply Database Migration Instructions

The database migration file `MIGRATION_add_event_images.sql` needs to be applied to add support for event posters and logos.

## Steps to Apply:

### 1. Open Supabase SQL Editor
- Go to your Supabase Dashboard: https://supabase.com/dashboard
- Navigate to your project: **zmoorddmgtkynvvthdod**
- Click on **SQL Editor** in the left sidebar

### 2. Run the Migration
- Click **"New Query"** button
- Copy the entire contents of `MIGRATION_add_event_images.sql`
- Paste into the SQL editor
- Click **"Run"** button

### 3. Verify Success
The last query in the migration will show the newly added columns:
```
column_name          | data_type            | is_nullable
---------------------|----------------------|------------
poster_thumb_url     | text                 | YES
poster_updated_at    | timestamp with time zone | YES
poster_url           | text                 | YES
```

### 4. Refresh Schema Cache (Optional)
If you still see errors after running the migration:
1. In Supabase Dashboard, go to **Database** → **Tables**
2. Click on the **events** table
3. Verify the new columns appear in the table structure
4. If needed, hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)

## What This Migration Adds:

### Events Table Columns:
- `poster_url` - Full size event poster URL (nullable)
- `poster_thumb_url` - Thumbnail poster URL (nullable)
- `poster_updated_at` - Last poster update timestamp (nullable)

### New Table: event_logos
A complete table for storing multiple logos per event with:
- Logo URLs (full and thumbnail)
- Label (e.g., "Sponsor", "Partner")
- Display order for sorting
- Row Level Security policies

All fields are nullable to ensure event creation succeeds even if image upload fails.

## Need Help?
If you encounter any errors:
1. Check the error message in the SQL Editor
2. Ensure you're using the correct Supabase project
3. Verify you have the necessary permissions (super_admin role)
