# Google Maps Embed Fix - Complete

## Problem Solved

Fixed the "connection refused" error when loading Google Maps by replacing the blocked `maps.google.com` iframe URL with the official **Google Maps Embed API**.

## Changes Made

### 1. Environment Configuration (`.env`)
Added support for Google Maps API key:
```env
VITE_GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY_HERE
```

### 2. Location Component (`src/pages/Location.tsx`)
- **Replaced** blocked iframe URL with official Embed API
- **Fixed coordinates** (no geocoding):
  - Latitude: `51.040054723022486`
  - Longitude: `5.327509253521941`
  - Zoom: `16`
- **Added** API key validation
- **Added** fallback UI when API key is not configured
- **Uses** official endpoint: `https://www.google.com/maps/embed/v1/view`

### 3. Fallback Behavior
When no valid API key is configured, the page displays:
- Clear instructions on how to get an API key
- Link to Google Cloud Console
- Button to open location directly in Google Maps (works without API key)

## What You Need to Do

### Get a Google Maps API Key (Free)

1. **Go to Google Cloud Console**: https://console.cloud.google.com/
2. **Create or select a project**
3. **Enable Maps Embed API**:
   - Navigate to "APIs & Services" → "Library"
   - Search for "Maps Embed API"
   - Click "Enable"
4. **Create API Key**:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "API Key"
   - Copy your API key
5. **Add to `.env` file**:
   ```env
   VITE_GOOGLE_MAPS_API_KEY=your_actual_api_key_here
   ```
6. **Restart dev server**: `npm run dev`

### Recommended: Restrict Your API Key

For security, restrict your API key to your domain:
1. In Google Cloud Console, go to your API key settings
2. Under "Application restrictions":
   - Select "HTTP referrers (websites)"
   - Add: `https://eskiler.be/*` and `https://www.eskiler.be/*`
3. Under "API restrictions":
   - Select "Restrict key"
   - Choose "Maps Embed API"

## Pricing

**Maps Embed API is FREE** with no usage limits for embedding maps.

## Testing

### Without API Key
- Map area shows instructions and "Open in Google Maps" button
- Address information is still visible
- Users can click button to open location in Google Maps app

### With Valid API Key
- Interactive embedded map loads automatically
- Map is centered on exact coordinates
- Full zoom/pan controls available

## Files Changed

1. `.env` - Added `VITE_GOOGLE_MAPS_API_KEY`
2. `src/pages/Location.tsx` - Updated to use Embed API
3. `GOOGLE_MAPS_SETUP.md` - Full setup documentation
4. `GOOGLE_MAPS_FIX_SUMMARY.md` - This summary

## Technical Details

### Old URL (Blocked)
```
https://maps.google.com/maps?q=51.040054723022486,5.327509253521941&z=15&output=embed
```

### New URL (Official Embed API)
```
https://www.google.com/maps/embed/v1/view?key={API_KEY}&center=51.040054723022486,5.327509253521941&zoom=16&maptype=roadmap
```

### Key Improvements
- ✅ Uses official Google Maps Embed API endpoint
- ✅ No more "connection refused" errors
- ✅ Fixed coordinates (no geocoding required)
- ✅ Graceful fallback when API key not configured
- ✅ User-friendly setup instructions
- ✅ Security best practices documented
- ✅ Free to use (no charges)

## Build Status

✅ Build successful - all changes compile correctly

## Next Steps

1. Get your Google Maps API key from Google Cloud Console
2. Add it to `.env` file
3. Restart development server
4. Verify map loads correctly on Location page

For detailed instructions, see: `GOOGLE_MAPS_SETUP.md`
