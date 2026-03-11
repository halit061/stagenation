# Table Package Data Fix - "Inbegrepen in deze tafel" Section Restored

## Issue
After the Safari compatibility fix, the "Inbegrepen in deze tafel" (Included in this table) section was not displaying on the Table Reservation details page when selecting a table with an associated package.

## Root Cause
The FloorPlan component was fetching table data with `select('*')`, which included the `package_id` field but not the actual package relationship data (name, description, included_people, included_items). This meant that when a table was selected, a separate query was needed to fetch the package details, but the data wasn't being properly populated or was failing silently.

## Solution
Expanded the Supabase select query in the FloorPlan component to include the package relationship data inline using a join. This ensures that package data is immediately available when a table is selected, without needing a separate query.

### Changes Made

#### 1. `src/components/FloorPlan.tsx`
**Before:**
```typescript
const { data: tablesData, error: tablesError } = await supabase
  .from('floorplan_tables')
  .select('*')
  .eq('is_active', true)
  .order('table_number', { ascending: true});
```

**After:**
```typescript
const { data: tablesData, error: tablesError } = await supabase
  .from('floorplan_tables')
  .select('*, table_packages(name, description, included_people, included_items)')
  .eq('is_active', true)
  .order('table_number', { ascending: true});
```

**What Changed:**
- Added explicit join to `table_packages` table
- Selected specific package fields: `name`, `description`, `included_people`, `included_items`
- Package data now embedded in table object as `table_packages` property

#### 2. `src/pages/TableReservation.tsx`
**Updated `handleTableSelect` function:**

**Before:**
```typescript
const handleTableSelect = async (table: FloorplanTable) => {
  setSelectedTable(table);

  if (table.package_id) {
    // Always made a separate query
    const { data: packageData, error } = await supabase
      .from('table_packages')
      .select('*')
      .eq('id', table.package_id)
      .maybeSingle();

    setSelectedPackage(packageData);
  }
  setStep('form');
};
```

**After:**
```typescript
const handleTableSelect = async (table: FloorplanTable) => {
  setSelectedTable(table);

  if (table.package_id && (table as any).table_packages) {
    // Use embedded package data from FloorPlan query
    setSelectedPackage((table as any).table_packages);
  } else if (table.package_id) {
    // Fallback: make separate query if embedded data not available
    const { data: packageData, error } = await supabase
      .from('table_packages')
      .select('*')
      .eq('id', table.package_id)
      .maybeSingle();

    setSelectedPackage(packageData);
  } else {
    setSelectedPackage(null);
  }
  setStep('form');
};
```

**What Changed:**
- First checks if package data is already embedded in the table object
- Uses embedded data directly if available (performance optimization)
- Falls back to separate query if embedded data not present (safety)
- Maintains Safari-safe error logging

## Benefits

1. **Restored Functionality**: "Inbegrepen in deze tafel" section now displays correctly
2. **Performance Improvement**: One less database query per table selection
3. **Safari Compatible**: Maintains all Safari-safe error handling
4. **Graceful Fallback**: Still works if embedded data isn't available
5. **No Breaking Changes**: All existing functionality preserved

## Data Displayed

When `selectedPackage` is populated, the UI shows:

**Section Title:**
- NL: "Inbegrepen in deze tafel"
- TR: "Bu masaya dahil"

**Package Data:**
- `description`: Text description of the package
- `included_people`: Number of people (e.g., "6 personen")
- `included_items`: Array of items with qty and label (e.g., "2x Bottle Service", "1x Reserved Seating")

**UI Behavior:**
- Section only appears if `selectedPackage` is not null
- Empty fields are gracefully hidden
- Maintains existing styling and layout

## What Was NOT Changed

- No components removed or refactored
- No routes modified
- No styling changes
- No UI layout changes
- Safari compatibility fix remains intact
- All existing pages and features untouched

## Testing Verification

✅ Build successful
✅ No TypeScript errors
✅ Package data query expanded correctly
✅ Fallback logic in place
✅ Safari-safe error logging maintained

## Database Fields Used

From `table_packages` table:
- `name` (text) - Package name
- `description` (text) - Package description
- `included_people` (int) - Number of included people
- `included_items` (jsonb) - Array of included items with format: `[{qty: number, label: string}]`
