import { supabase } from './supabase';
import { getPendingSyncs, markSynced, incrementSyncAttempt } from './database';
import * as Network from 'expo-network';

let syncInterval: ReturnType<typeof setInterval> | null = null;

export async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return state.isConnected === true && state.isInternetReachable !== false;
  } catch {
    return false;
  }
}

export async function syncPendingScans(): Promise<number> {
  if (!(await isOnline())) return 0;

  const pending = await getPendingSyncs();
  let synced = 0;

  for (const item of pending) {
    try {
      const payload = JSON.parse(item.payload);
      const { data, error } = await supabase.functions.invoke('unified-scan', {
        body: {
          code: payload.qr_raw,
          event_id: payload.event_id,
          source: 'mobile_scanner_sync',
        },
      });

      if (error && !error.message?.includes('already')) {
        await incrementSyncAttempt(item.id, error.message || 'Unknown error');
        continue;
      }

      await markSynced(item.scan_id, item.id);
      synced++;
    } catch (err: any) {
      await incrementSyncAttempt(item.id, err.message || 'Network error');
    }
  }

  return synced;
}

export function startSyncLoop(): void {
  if (syncInterval) return;
  syncInterval = setInterval(async () => {
    try {
      await syncPendingScans();
    } catch {}
  }, 10_000);
}

export function stopSyncLoop(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
