# Terms & Conditions Implementation - Complete Guide

## Summary

Multi-language Terms & Conditions with mandatory acceptance at checkout has been fully implemented for Eskiler.be.

## What's Been Implemented

### 1. Terms & Conditions Pages (3 Languages)
✅ Created dedicated T&C page at: `#terms`
✅ Available in:
- 🇳🇱 Dutch (Nederlands): Algemene Voorwaarden
- 🇬🇧 English: Terms & Conditions
- 🇹🇷 Turkish (Türkçe): Genel Şartlar

**Content includes:**
- Scope & applicability
- Tickets & access rules
- Cancellation & refund policy (exceptional cases only)
- Event cancellation/changes policy
- Liability limitations
- Behaviour & safety requirements
- Privacy & GDPR compliance
- Applicable Belgian law

**Features:**
- Premium dark theme styling with cyan accents
- Icon-based sections for easy scanning
- Contact information for questions
- Opens in new tab from checkout

### 2. Mandatory Acceptance Checkbox at Checkout
✅ Added required checkbox in ticket purchase flow
✅ Unchecked by default
✅ Blocks payment until accepted
✅ Inline validation with clear error message
✅ Clickable link to T&C page (opens in new tab)

**Multi-language labels:**
- NL: "Ik ga akkoord met de algemene voorwaarden"
- EN: "I agree to the terms and conditions"
- TR: "Genel şartları kabul ediyorum"

**Validation:**
- Red border highlight when unchecked + error shown
- Clear warning message in active language
- Cannot proceed to payment without acceptance

### 3. Terms Acceptance Tracking (Database)
✅ Backend stores proof of acceptance with every ticket

**Database fields added to `tickets` table:**
- `terms_accepted` (boolean) - Whether T&C were accepted
- `terms_accepted_at` (timestamptz) - When accepted
- `terms_version` (text) - Version "2024-12-15"
- `terms_language` (text) - Language (nl/en/tr)

**Purpose:**
- Legal compliance & audit trail
- Know which version was accepted
- Track language of acceptance
- Full GDPR compliance

### 4. Footer Link
✅ Added T&C link in footer (all pages)
✅ Language-aware (shows correct label per language)
✅ Easy access from anywhere on site

---

## What You Need To Do

### Step 1: Apply Database Migration (Required)
⚠️ This MUST be done before the checkout can store T&C acceptance data.

**Instructions:**
1. Open Supabase SQL Editor:
   - Go to: https://supabase.com/dashboard/project/zmoorddmgtkynvvthdod/sql

2. Run the migration:
   - Open file: `MIGRATION_add_terms_acceptance.sql`
   - Copy the entire contents
   - Paste into SQL Editor
   - Click "Run"

3. Verify:
   - The query will show the 4 new columns added to `tickets` table
   - Refresh browser if needed

**What this adds:**
- Terms acceptance tracking fields to tickets table
- Index for efficient queries
- All fields nullable (backwards compatible)

### Step 2: Deploy Updated Edge Function (Required)
⚠️ The `create-ticket-checkout` edge function needs to be redeployed.

**What was updated:**
- Now accepts `terms_accepted` and `terms_language` from frontend
- Stores T&C acceptance data with version "2024-12-15"
- Timestamps acceptance automatically

**To deploy:**
You'll need to redeploy the edge function via Supabase dashboard or CLI.

---

## Testing Checklist

After applying migrations and deploying:

### Frontend Testing:
- [ ] Visit `#terms` page in all 3 languages (nl/en/tr)
- [ ] Verify T&C content displays correctly
- [ ] Click footer "Algemene Voorwaarden" / "Terms & Conditions" / "Genel Şartlar" link
- [ ] Start ticket checkout flow
- [ ] Verify checkbox is unchecked by default
- [ ] Try to proceed without checking - should show error
- [ ] Click T&C link in checkbox label - opens in new tab
- [ ] Check checkbox and complete purchase
- [ ] Verify purchase goes through successfully

### Backend Testing:
- [ ] After a purchase, check the `tickets` table in Supabase
- [ ] Verify `terms_accepted = true`
- [ ] Verify `terms_accepted_at` has timestamp
- [ ] Verify `terms_version = "2024-12-15"`
- [ ] Verify `terms_language` matches language used (nl/en/tr)

---

## Files Changed

### Frontend:
- ✅ `src/pages/TermsAndConditions.tsx` - NEW: T&C page component
- ✅ `src/App.tsx` - Added route for T&C page
- ✅ `src/pages/Tickets.tsx` - Enhanced checkbox with link, validation, sends data to backend
- ✅ `src/components/Layout.tsx` - Added footer link
- ✅ `src/lib/translations.ts` - Added T&C translations (all 3 languages)

### Backend:
- ✅ `supabase/functions/create-ticket-checkout/index.ts` - Stores T&C acceptance
- ✅ `MIGRATION_add_terms_acceptance.sql` - Database migration (needs manual run)

### Build:
- ✅ All files built successfully
- ✅ Ready for production deployment

---

## Design & UX

**Styling:**
- Premium dark theme (consistent with site)
- Cyan accents for links and highlights
- Good contrast for readability (white text on dark background)
- Red error states for validation
- Icon-based sections for easy navigation
- Responsive design (mobile & desktop)

**User Flow:**
1. User adds tickets to cart
2. Proceeds to checkout form
3. Fills in name, email, phone
4. **Must check T&C checkbox** (with link to read full T&C)
5. If unchecked: Clear error message shown
6. If checked: Can proceed to payment
7. Backend stores acceptance proof with ticket

---

## Legal Compliance

✅ **GDPR Compliant:**
- Explicit consent required
- Clear language
- Accessible T&C text
- Proof stored with timestamp & version
- User can review before accepting

✅ **Audit Trail:**
- Each ticket has acceptance record
- Timestamp of acceptance
- Version of T&C accepted
- Language of acceptance

✅ **Belgian Law:**
- T&C explicitly state Belgian law applies
- Proper refund policy (exceptional cases only)
- Liability limitations clearly stated
- Contact information provided

---

## Maintenance

**Updating T&C in the future:**
1. Edit content in `src/pages/TermsAndConditions.tsx`
2. Update `lastUpdate` date in each language
3. Update `termsVersion` in `supabase/functions/create-ticket-checkout/index.ts`
4. Rebuild and deploy

**Version History:**
- v2024-12-15: Initial implementation with 3 languages

---

## Support & Questions

If users have questions about T&C:
- Contact information shown at bottom of T&C page
- Email: info@eskiler.be
- Phone: 0490 11 94 25
- Footer link always accessible

---

## Summary Status

| Feature | Status | Action Required |
|---------|--------|-----------------|
| T&C Pages (3 languages) | ✅ Complete | None |
| Footer links | ✅ Complete | None |
| Checkout checkbox | ✅ Complete | None |
| Validation & errors | ✅ Complete | None |
| Frontend build | ✅ Complete | None |
| Database schema | ⚠️ Ready | **Apply migration SQL** |
| Edge function | ⚠️ Ready | **Redeploy function** |
| Testing | ⏳ Pending | Test after deployment |

**Next Steps:**
1. Apply database migration (5 minutes)
2. Redeploy edge function (2 minutes)
3. Test complete flow (10 minutes)
4. ✅ Go live!
