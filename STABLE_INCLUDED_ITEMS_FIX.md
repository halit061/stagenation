# Stable "Inbegrepen in deze tafel" Fix - Complete Implementation

## Problem
The "Inbegrepen in deze tafel" (Included in this table) section was disappearing due to unreliable joins to `table_packages` table. RLS policies and join complexity caused data to not load properly in Chrome and Safari.

## Solution Strategy
**Stop relying on joins** - Store included items data directly on the `floorplan_tables` record for maximum stability and simplicity.

## Part A: Database Migration ✅

### Migration Applied: `add_included_fields_to_floorplan_tables`

**New Columns Added to `floorplan_tables`:**
1. `included_text` (text) - Plain text description of included items
2. `included_items` (jsonb) - Array of included item strings/objects
3. `max_guests` (integer) - Maximum number of guests allowed

**Data Backfill:**
- Automatically copied data from `table_packages` where relations exist
- Only updates NULL values (preserves existing data)
- Sets `max_guests` to `capacity` as default if still NULL

**RLS Policy:**
- Added public SELECT policy: "Public can view active tables"
- Allows anonymous users to view active tables (required for reservations)
- No authentication needed for table browsing

**Features:**
- ✅ Idempotent (safe to run multiple times)
- ✅ Preserves existing data
- ✅ No breaking changes
- ✅ Performance index added

## Part B: Frontend Table Reservations ✅

### FloorPlan Component (`src/components/FloorPlan.tsx`)

**Changed:**
```typescript
// BEFORE: Join to table_packages (unreliable)
.select('*, table_packages(name, description, included_people, included_items)')

// AFTER: Direct select (stable)
.select('*')
```

**Benefits:**
- No more join complexity
- No RLS issues with related tables
- Faster queries
- Works in Safari without CORS issues

### TableReservation Component (`src/pages/TableReservation.tsx`)

**Data Loading:**
```typescript
// Uses included data directly from table record
const tableData = table as any;
if (tableData.included_items || tableData.included_text) {
  const pkg = {
    name: tableData.table_number,
    description: tableData.included_text,
    included_people: tableData.max_guests,
    included_items: tableData.included_items
  };
  setSelectedPackage(pkg);
}
```

**Multi-Format Support:**
- Array of strings: `["4 Flessen Sterke Drank", "20 Frisdranken"]`
- Array of objects: `[{qty: 4, label: "Flessen"}, {label: "Hapjes"}]`
- Comma-separated string: `"Item1, Item2, Item3"`
- Dash-separated string: `"Item1 - Item2 - Item3"`

**Display Format:**
All formats normalized to: `"4 Flessen Sterke Drank - 20 Frisdranken - Koude Hapjes"`

**Guest Validation:**
```typescript
// Now uses max_guests field with fallback to capacity
max={(selectedTable as any).max_guests || selectedTable.capacity}
```

**Validation:**
- Blocks checkout if guests exceed `max_guests`
- Clear error message shown
- Form submit button disabled when invalid

## Part C: SuperAdmin FloorPlan Editor ✅

### FloorPlanEditor Component (`src/components/FloorPlanEditor.tsx`)

**New Editable Fields Added:**

1. **Max Personen** (max_guests)
   - Number input, range 1-100
   - Defaults to capacity if not set
   - Saved on blur

2. **Inbegrepen Tekst** (included_text)
   - Text input for description
   - Optional field
   - Saved on blur

3. **Inbegrepen Items** (included_items)
   - Textarea with JSON array
   - Real-time JSON validation
   - Placeholder shows example format
   - Supports both string arrays and object arrays

**Save Function Updated:**
```typescript
.update({
  // ... existing fields ...
  max_guests: tableData.max_guests,
  included_text: tableData.included_text,
  included_items: tableData.included_items,
  updated_at: new Date().toISOString(),
})
```

## Part D: Purchase Constraint ✅

**Guest Count Enforcement:**
- Input max attribute: `max={(selectedTable as any).max_guests || selectedTable.capacity}`
- Real-time validation with clamping
- Submit button disabled when exceeded
- Clear error message in Dutch/Turkish

**Error Messages:**
```typescript
{language === 'nl'
  ? `Maximum ${maxGuests} personen voor deze tafel`
  : `Bu masa için maksimum ${maxGuests} kişi`}
```

## Part E: Safari Compatibility ✅

**Direct REST Fetches Removed:**
- ❌ Removed: `fetch(${SUPABASE_URL}/rest/v1/...)`
- ✅ Added: Supabase JS client only

**Benefits:**
- No CORS issues
- No access control errors
- Works identically in Chrome and Safari
- Automatic auth header management

**Debug Logging:**
```typescript
console.log('[DEBUG] Selected table:', table);
console.log('[DEBUG] Direct included_items:', tableData.included_items);
console.log('[DEBUG] Direct included_text:', tableData.included_text);
console.log('[DEBUG] Direct max_guests:', tableData.max_guests);
```

## Expected Behavior

### When Selecting "Chesterfield Vip":

**Console Output:**
```
[DEBUG] FloorPlan loaded tables: [...]
[DEBUG] First table with included items: {...}
[DEBUG] Selected table: {...}
[DEBUG] Direct included_items: ["4 Flessen Sterke Drank", "20 Frisdranken", "Koude Hapjes"]
[DEBUG] Using direct table included data: {...}
[DEBUG] Rendering package: {...}
[DEBUG] Included list: ["4 Flessen Sterke Drank", "20 Frisdranken", "Koude Hapjes"]
[DEBUG] Show section: true
```

**UI Display:**
```
Geselecteerde Tafel
├─ Tafel: Chesterfield Vip
├─ Capaciteit: 8p
├─ Type: Zittafel
├─ Prijs: €150
└─ Inbegrepen in deze tafel
   ├─ 8 personen
   └─ 4 Flessen Sterke Drank - 20 Frisdranken - Koude Hapjes
```

## What Was NOT Changed

✅ **All Existing Pages Preserved:**
- Home
- Agenda
- Tickets
- Locatie/Map
- Media
- Contact
- Dranken
- SuperAdmin
- All styling intact

✅ **No Refactors:**
- No component restructuring
- No file deletions
- No route changes
- Only targeted additions

## Database Schema

### floorplan_tables (Updated)
```sql
CREATE TABLE floorplan_tables (
  id uuid PRIMARY KEY,
  table_number text UNIQUE NOT NULL,
  table_type text NOT NULL CHECK (table_type IN ('SEATED', 'STANDING')),
  capacity integer NOT NULL,
  x decimal(10,2) NOT NULL,
  y decimal(10,2) NOT NULL,
  width decimal(10,2) NOT NULL,
  height decimal(10,2) NOT NULL,
  rotation decimal(10,2) DEFAULT 0,
  price decimal(10,2) NOT NULL,
  is_active boolean DEFAULT true,
  manual_status text,
  package_id uuid REFERENCES table_packages(id),

  -- NEW FIELDS
  max_guests integer,                    -- Max guests allowed
  included_text text,                    -- Description of included items
  included_items jsonb DEFAULT '[]',    -- Array of included items

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

## Testing Verification

✅ Build successful
✅ No TypeScript errors
✅ Migration applied successfully
✅ Public RLS policy created
✅ Data backfilled from table_packages
✅ Frontend uses direct fields
✅ SuperAdmin can edit new fields
✅ Guest validation enforced
✅ Safari compatibility maintained

## SuperAdmin Usage

### To Add Included Items to a Table:

1. Open SuperAdmin → Floorplan Editor
2. Click on a table
3. In right sidebar, scroll to new fields:
   - **Max Personen**: Set maximum guest count (e.g., 8)
   - **Inbegrepen Tekst**: Add description (optional)
   - **Inbegrepen Items**: Add JSON array:
     ```json
     ["4 Flessen Sterke Drank", "20 Frisdranken", "Koude Hapjes"]
     ```
4. Fields save automatically on blur
5. Included items now appear on public table reservation page

### JSON Array Formats:

**Simple String Array:**
```json
["4 Flessen Sterke Drank", "20 Frisdranken", "Koude Hapjes"]
```

**Object Array (with qty):**
```json
[
  {"qty": 4, "label": "Flessen Sterke Drank"},
  {"qty": 20, "label": "Frisdranken"},
  {"label": "Koude Hapjes"}
]
```

Both formats work and display as: `"4 Flessen Sterke Drank - 20 Frisdranken - Koude Hapjes"`

## Summary

This fix makes the "Inbegrepen in deze tafel" section **stable and reliable** by:
1. Storing data directly on table records (no joins)
2. Backfilling existing package data automatically
3. Providing SuperAdmin UI to manage included items
4. Supporting multiple data formats
5. Enforcing guest count limits
6. Working identically in Chrome and Safari

**Result:** The section now displays correctly and consistently across all browsers without relying on complex joins or RLS policies.
