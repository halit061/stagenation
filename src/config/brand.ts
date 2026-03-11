export const APP_NAME = 'StageNation';
export const APP_SLUG = 'stagenation';
export const PUBLIC_SITE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://stagenation.be';
export const EDGE_FUNCTION_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
