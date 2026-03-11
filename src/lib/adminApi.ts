import { supabase } from './supabaseClient';

const ADMIN_DATA_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data`;

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  return session.access_token;
}

export async function adminFetch<T = Record<string, unknown>>(
  action: string,
  extra: Record<string, unknown> = {}
): Promise<T> {
  const token = await getToken();

  const res = await fetch(ADMIN_DATA_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...extra }),
  });

  if (res.status === 401) {
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshData.session) {
      throw new Error('Session expired, please log in again');
    }

    const retryRes = await fetch(ADMIN_DATA_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${refreshData.session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, ...extra }),
    });

    const retryData = await retryRes.json();
    if (!retryRes.ok) throw new Error(retryData.error || 'Request failed after refresh');
    return retryData as T;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}
