import { supabase } from './supabaseClient';

export interface SourceData {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  referrer: string | null;
  landing_page: string;
  first_visit_at: string;
}

const STORAGE_KEY = 'sn_source_data';

export function captureSource(): void {
  const existing = sessionStorage.getItem(STORAGE_KEY);
  if (existing) return;

  const params = new URLSearchParams(window.location.search);

  const data: SourceData = {
    utm_source: params.get('utm_source'),
    utm_medium: params.get('utm_medium'),
    utm_campaign: params.get('utm_campaign'),
    utm_content: params.get('utm_content'),
    utm_term: params.get('utm_term'),
    referrer: document.referrer || null,
    landing_page: window.location.href,
    first_visit_at: new Date().toISOString(),
  };

  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getSourceData(): SourceData | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SourceData;
  } catch {
    return null;
  }
}

export function attachSourceToOrder(orderId: string): void {
  const source = getSourceData();
  if (!source) return;

  supabase
    .from('orders')
    .update({
      utm_source: source.utm_source,
      utm_medium: source.utm_medium,
      utm_campaign: source.utm_campaign,
      utm_content: source.utm_content,
      utm_term: source.utm_term,
      referrer: source.referrer,
      landing_page: source.landing_page,
      first_visit_at: source.first_visit_at,
    })
    .eq('id', orderId)
    .then(() => {});
}

export function getReferrerSource(referrer: string | null): string {
  if (!referrer) return 'direct';

  const lower = referrer.toLowerCase();
  if (lower.includes('facebook.com') || lower.includes('fb.com')) return 'facebook';
  if (lower.includes('instagram.com')) return 'instagram';
  if (lower.includes('google.')) return 'google';
  if (lower.includes('tiktok.com')) return 'tiktok';
  if (lower.includes('bing.com')) return 'bing';
  if (lower.includes('mail.')) return 'email';
  if (lower.includes('linkedin.com')) return 'linkedin';
  if (lower.includes('youtube.com')) return 'youtube';

  try {
    return new URL(referrer).hostname.replace('www.', '');
  } catch {
    return 'unknown';
  }
}
