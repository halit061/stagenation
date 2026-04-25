export const FB_PIXEL_ID = '1457559385824293';

type FbqFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    fbq?: FbqFn;
    _fbq?: FbqFn;
  }
}

interface ConsentData {
  necessary?: boolean;
  preferences?: boolean;
  analytics?: boolean;
}

export function readConsent(): ConsentData | null {
  try {
    const raw = localStorage.getItem('cookie_consent');
    if (!raw) return null;
    return JSON.parse(raw) as ConsentData;
  } catch {
    return null;
  }
}

export function hasMarketingConsent(): boolean {
  const c = readConsent();
  return !!(c && c.analytics);
}

export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

export function getFbBrowserContext() {
  return {
    fbp: readCookie('_fbp'),
    fbc: readCookie('_fbc'),
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    event_source_url: typeof window !== 'undefined' ? window.location.href : null,
  };
}

let pixelInitialized = false;

export function initPixel() {
  if (typeof window === 'undefined') return;
  if (typeof window.fbq !== 'function') return;
  if (pixelInitialized) return;
  pixelInitialized = true;
  window.fbq('init', FB_PIXEL_ID);
}

export function grantConsent() {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;
  initPixel();
  window.fbq('consent', 'grant');
}

export function revokeConsent() {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;
  window.fbq('consent', 'revoke');
}

export interface TrackOptions {
  eventID?: string;
}

export function track(event: string, params?: Record<string, unknown>, options?: TrackOptions) {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;
  if (!hasMarketingConsent()) return;
  try {
    if (options?.eventID) {
      window.fbq('track', event, params || {}, { eventID: options.eventID });
    } else {
      window.fbq('track', event, params || {});
    }
  } catch {
    /* noop */
  }
}

export function trackPageView() {
  track('PageView');
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

function normalizePhone(v: string): string {
  return v.replace(/[^\d]/g, '');
}

function normalizeName(v: string): string {
  return v.trim().toLowerCase();
}

export interface AdvancedMatchInput {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  country?: string | null;
  city?: string | null;
  zip?: string | null;
}

export interface HashedAdvancedMatch {
  em?: string;
  ph?: string;
  fn?: string;
  ln?: string;
  country?: string;
  ct?: string;
  zp?: string;
}

export async function buildAdvancedMatch(input: AdvancedMatchInput): Promise<HashedAdvancedMatch> {
  const out: HashedAdvancedMatch = {};
  if (input.email) out.em = await sha256Hex(normalizeEmail(input.email));
  if (input.phone) out.ph = await sha256Hex(normalizePhone(input.phone));

  let first = input.firstName?.trim() || '';
  let last = input.lastName?.trim() || '';
  if ((!first || !last) && input.fullName) {
    const parts = input.fullName.trim().split(/\s+/);
    if (parts.length > 0 && !first) first = parts[0];
    if (parts.length > 1 && !last) last = parts.slice(1).join(' ');
  }
  if (first) out.fn = await sha256Hex(normalizeName(first));
  if (last) out.ln = await sha256Hex(normalizeName(last));
  if (input.country) out.country = await sha256Hex(input.country.trim().toLowerCase());
  if (input.city) out.ct = await sha256Hex(input.city.trim().toLowerCase().replace(/\s+/g, ''));
  if (input.zip) out.zp = await sha256Hex(input.zip.trim().toLowerCase());
  return out;
}
