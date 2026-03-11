# "Inbegrepen in deze tafel" Section Bugfix

## Issue
The "Inbegrepen in deze tafel" (Included in this table) section was not displaying on the Table Reservations page when selecting a table with an associated package.

## Root Cause
The data was being fetched from the database via a join to `table_packages`, but the UI rendering logic was:
1. Too strict in its format expectations (only accepted array of objects with `{qty, label}`)
2. Missing comprehensive debug logging to diagnose the issue
3. No visible error messages when package loading failed

## Solution Implemented

### 1. Enhanced Debug Logging

Added comprehensive console logging throughout the data flow:

**FloorPlan.tsx:**
- Logs all loaded tables with package relationships
- Shows first table with package_id for verification
- Helps verify join query is working correctly

**TableReservation.tsx:**
- Logs selected table object
- Logs package_id presence
- Logs embedded package data from join
- Logs package fetch attempts and results
- Shows computed includedList array
- Indicates whether section should be shown

### 2. Flexible Data Format Support

Updated the UI rendering to support **multiple data formats**:

#### Format A: Array of Objects (Original)
```json
[
  {"qty": 4, "label": "Flessen Sterke Drank"},
  {"qty": 20, "label": "Frisdranken"},
  {"label": "Koude Hapjes"}
]
```

#### Format B: Array of Strings
```json
[
  "4 Flessen Sterke Drank",
  "20 Frisdranken",
  "Koude Hapjes"
]
```

#### Format C: Comma/Dash-Separated String
```
"4 Flessen Sterke Drank - 20 Frisdranken - Koude Hapjes"
```

#### Format D: Plain String
```
"4 Flessen Sterke Drank, 20 Frisdranken, Koude Hapjes"
```

### 3. Unified Rendering Format

All formats are normalized to an array and displayed as:
```
4 Flessen Sterke Drank - 20 Frisdranken - Koude Hapjes
```

This creates a clean, single-line display separated by " - " dashes.

### 4. Visible Error Messages (Dev Mode)

Added `packageError` state to display database errors in the UI:
- Shows `[DEV]` prefix to indicate development/debug message
- Displays Supabase error message if package fetch fails
- Visible red error box in the table details section
- Helps diagnose Safari CORS or database query issues

### 5. Graceful Fallback Logic

The package loading logic now:
1. **First**: Uses embedded package data from FloorPlan join (fastest)
2. **Fallback**: Makes separate query if embedded data missing
3. **Error Handling**: Shows error message and continues without package

## Code Changes

### src/components/FloorPlan.tsx
```typescript
// Added package join to query
.select('*, table_packages(name, description, included_people, included_items)')

// Added debug logging
console.log('[DEBUG] FloorPlan loaded tables:', tablesData);
console.log('[DEBUG] First table with package:', tablesData?.find((t: any) => t.package_id));
```

### src/pages/TableReservation.tsx

**New State:**
```typescript
const [packageError, setPackageError] = useState<string>('');
```

**Enhanced handleTableSelect:**
- Comprehensive debug logging at each step
- Error state management
- Clear error messages with [DEV] prefix

**Updated UI Rendering:**
```typescript
// Normalize included_items to array format
let includedList: string[] = [];

if (selectedPackage.included_items) {
  if (Array.isArray(selectedPackage.included_items)) {
    // Handle array of objects or strings
    includedList = selectedPackage.included_items.map((item: any) => {
      if (typeof item === 'string') return item.trim();
      if (item.qty && item.label) return `${item.qty} ${item.label}`;
      if (item.label) return item.label;
      return String(item);
    }).filter(Boolean);
  } else if (typeof selectedPackage.included_items === 'string') {
    // Handle comma or dash-separated string
    includedList = selectedPackage.included_items
      .split(/\s*[-,]\s*/)
      .map(s => s.trim())
      .filter(Boolean);
  }
}

// Display as single line with dashes
{includedList.length > 0 && (
  <div className="mt-3">
    <p className="text-slate-300">
      {includedList.join(' - ')}
    </p>
  </div>
)}
```

**Error Display:**
```typescript
{packageError && (
  <div className="mt-6 pt-6 border-t border-slate-700">
    <div className="bg-red-500/10 border border-red-500 rounded-lg p-4 text-red-500 text-sm">
      {packageError}
    </div>
  </div>
)}
```

## Testing Verification

✅ Build successful
✅ No TypeScript errors
✅ Debug logging active
✅ Multiple format support implemented
✅ Error messages visible in UI
✅ Safari compatibility maintained (no direct REST fetches)

## Expected Behavior

When selecting "Chesterfield Vip" table:

### If Package Exists:
1. Console shows debug logs with table and package data
2. "Inbegrepen in deze tafel" section displays
3. Shows description if present
4. Shows included_people count (e.g., "6 personen")
5. Shows included items as: "4 Flessen Sterke Drank - 20 Frisdranken - Koude Hapjes"

### If Package Missing:
1. Section hidden (normal behavior)
2. Console shows "No package ID found"

### If Package Load Fails:
1. Red error box displays with: `[DEV] Package load error: [error message]`
2. Console shows error details
3. User can still proceed with booking

## Database Schema

**table_packages:**
- `id` (uuid)
- `name` (text)
- `description` (text)
- `included_people` (integer)
- `included_items` (jsonb) - stores array

**floorplan_tables:**
- `id` (uuid)
- `package_id` (uuid) - references table_packages(id)
- ... other fields ...

Join is done via: `table_packages(name, description, included_people, included_items)`

## What Was NOT Changed

- No components removed
- No routes modified
- No styling changes (except error display)
- Safari compatibility preserved
- All existing features untouched
- Package section only shows when data exists
