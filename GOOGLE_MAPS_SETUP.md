# Google Maps API Setup

## Overview

The Location page uses the official Google Maps Embed API to display an interactive map with fixed coordinates.

## Coordinates

The map is centered on:
- **Latitude**: 51.040054723022486
- **Longitude**: 5.327509253521941
- **Zoom Level**: 16

## API Key Setup

### 1. Get a Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Maps Embed API**:
   - Navigate to "APIs & Services" → "Library"
   - Search for "Maps Embed API"
   - Click "Enable"
4. Create credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "API Key"
   - Copy your API key

### 2. Restrict Your API Key (Recommended)

For security, restrict your API key:

1. Click on your API key in the credentials list
2. Under "Application restrictions":
   - Select "HTTP referrers (websites)"
   - Add your website domains (e.g., `https://eskiler.be/*`, `https://www.eskiler.be/*`)
3. Under "API restrictions":
   - Select "Restrict key"
   - Choose "Maps Embed API"
4. Save

### 3. Add API Key to Environment

Add your API key to the `.env` file:

```env
VITE_GOOGLE_MAPS_API_KEY=your_actual_api_key_here
```

Replace `YOUR_GOOGLE_MAPS_API_KEY_HERE` with your actual API key.

### 4. Restart Development Server

After adding the API key, restart your development server:

```bash
npm run dev
```

## Fallback Behavior

If no valid API key is configured, the Location page will display:
- A message explaining that an API key is required
- Instructions on how to get an API key
- A button to open the location directly in Google Maps

## Pricing

Google Maps Embed API usage is free with the following limits:
- Unlimited map loads per day
- No usage charges for embedding maps

For more information, visit: https://mapsplatform.google.com/pricing/

## Troubleshooting

### Map shows "For development purposes only" watermark

This means you haven't enabled billing on your Google Cloud project. You need to:
1. Enable billing in Google Cloud Console
2. This won't charge you unless you exceed the free tier

### Map doesn't load at all

1. Check that your API key is correctly added to `.env`
2. Ensure you've enabled the Maps Embed API in Google Cloud Console
3. Check browser console for error messages
4. Verify your API key restrictions allow your domain

### "RefererNotAllowedMapError"

Your API key is restricted to specific domains, and your current domain is not allowed:
1. Go to Google Cloud Console → Credentials
2. Edit your API key
3. Add your current domain to the allowed referrers list
