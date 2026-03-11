# Simple Remaining Tickets Display Feature

## Overview
Minimal scarcity display feature - SuperAdmin can enable "Nog X beschikbaar" label on ticket types.

---

## GOAL #1: Tickets Page Restoration ✅

**Files Reverted:**
- `src/pages/Tickets.tsx` - Removed complex scarcity imports and logic
- Removed `src/lib/scarcityUtils.ts` (unused utility file)

**Route Confirmed:**
- URL: `/#tickets`
- Component: `src/pages/Tickets.tsx`
- Status: ✅ Working, builds successfully

---

## GOAL #2: Minimal Feature Implementation ✅

### A) Database Migration
**Migration:** `add_simple_remaining_display`

**2 columns added to `ticket_types` table:**

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `show_remaining_tickets` | BOOLEAN | FALSE | Enable/disable scarcity display |
| `remaining_display_threshold` | INTEGER | NULL | Show only when remaining ≤ threshold (NULL = always show) |

**Constraint:**
- `remaining_display_threshold` must be > 0 if set

---

### B) SuperAdmin UI
**Location:** SuperAdmin Panel → Tickets Tab → Create/Edit Ticket Type

**2 controls added:**

1. **Toggle: "Toon resterende tickets"**
   - Master on/off switch
   - Default: OFF

2. **Input: "Toon pas wanneer resterend ≤"** (visible only when toggle is ON)
   - Optional threshold
   - Leave empty to always show
   - Example: Set to 50 to only show when ≤ 50 tickets remain
   - Placeholder: "bijv. 50"

**File modified:** `src/pages/SuperAdmin.tsx`
- Lines 138-149: Added fields to ticketForm state
- Lines 1184-1199: handleEditTicket loads fields
- Lines 1278-1290: resetTicketForm resets fields
- Lines 1020-1026: handleTicketSubmit saves fields
- Lines 2872-2902: Added simple UI controls

---

### C) Public Display
**Location:** Tickets page (/#tickets) - Next to ticket price

**Display Logic:**
```typescript
const remaining = Math.max(0, available);
const shouldShowRemaining =
  ticketType.show_remaining_tickets &&
  ticketType.quantity_total != null &&
  (ticketType.remaining_display_threshold == null || remaining <= ticketType.remaining_display_threshold);
```

**Label shown:** `Nog {remaining} beschikbaar`
**Style:** Gray badge with border

**File modified:** `src/pages/Tickets.tsx`
- Lines 246-251: Display logic
- Lines 281-285: Badge display

---

### D) Display Rules

**Label shows when:**
1. `show_remaining_tickets = TRUE` (SuperAdmin enabled it)
2. `quantity_total` is not NULL (ticket type has a max quantity)
3. Either:
   - `remaining_display_threshold` is NULL (always show), OR
   - `remaining ≤ remaining_display_threshold`

**Label hidden when:**
- Toggle is OFF
- No max quantity set
- Remaining > threshold (if threshold is set)

**Examples:**
- Toggle OFF → Never shows
- Toggle ON, threshold = NULL, 100 remaining → "Nog 100 beschikbaar"
- Toggle ON, threshold = 50, 60 remaining → Hidden (60 > 50)
- Toggle ON, threshold = 50, 45 remaining → "Nog 45 beschikbaar"
- Toggle ON, threshold = 50, 0 remaining → "Nog 0 beschikbaar"

---

## Files Changed Summary

### Database:
1. **Migration applied:** `add_simple_remaining_display`
   - 2 columns added to `ticket_types`
   - 1 constraint added

### Modified Files:
2. **src/pages/SuperAdmin.tsx**
   - Added 2 fields to form state
   - Added 2 UI controls (toggle + threshold input)
   - Updated save/load/reset handlers

3. **src/pages/Tickets.tsx**
   - Added display logic (5 lines)
   - Added badge display (5 lines)

### Removed Files:
4. **src/lib/scarcityUtils.ts** (deleted - unused)
5. **TICKET_SCARCITY_DISPLAY_IMPLEMENTATION.md** (deleted - outdated)
6. **SCARCITY_QUICK_TEST.md** (deleted - outdated)

---

## No Changes Made To:
- Checkout logic
- Pricing logic
- Inventory logic
- Orders logic
- Tickets logic
- Any other pages or components
- Routes or navigation

---

## Build Status
✅ **npm run build** successful
✅ No errors or warnings
✅ Tickets page working at `/#tickets`

---

## Testing

### Test 1: Toggle OFF (default)
1. Create ticket type without enabling toggle
2. View on tickets page
3. **Expected:** No "Nog X beschikbaar" label

### Test 2: Toggle ON, no threshold
1. Edit ticket type, enable "Toon resterende tickets"
2. Leave threshold empty
3. Save
4. View on tickets page
5. **Expected:** Label shows (e.g., "Nog 45 beschikbaar")

### Test 3: Toggle ON with threshold
1. Edit ticket type, enable toggle
2. Set threshold to 50
3. Create ticket with 100 total, 40 sold (60 remaining)
4. View on tickets page
5. **Expected:** No label (60 > 50)
6. Sell 15 more (45 remaining)
7. **Expected:** Label appears "Nog 45 beschikbaar"

### Test 4: Soldout
1. Enable toggle
2. Sell all tickets (0 remaining)
3. **Expected:** Label shows "Nog 0 beschikbaar"

---

## How to Use

### SuperAdmin:
1. Navigate to SuperAdmin Panel → Tickets Tab
2. Create new or edit existing ticket type
3. Scroll down past "Actief" checkbox
4. Check "Toon resterende tickets"
5. Optional: Enter threshold number (e.g., 50)
6. Save
7. Visit tickets page to verify

### Public:
- Badge automatically appears next to ticket price when conditions are met
- No user action required

---

## Summary

**Scope:** Display-only feature, 2 database fields, minimal UI changes
**SuperAdmin Controls:** 2 (toggle + optional threshold)
**Public Display:** Simple badge "Nog X beschikbaar"
**Files Changed:** 2 (SuperAdmin.tsx, Tickets.tsx)
**Files Removed:** 1 (scarcityUtils.ts)
**Build:** ✅ Successful
**Tickets Page:** ✅ Restored and working

Feature complete and minimal as requested.
