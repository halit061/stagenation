import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const supabaseUrl = process.env.EXPO_PUBLIC_STAGENATION_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_STAGENATION_SUPABASE_ANON_KEY || '';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

function createSupabaseClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      '[StageNation] FATAL: Missing env vars. Create scanner/.env with:\n' +
      'EXPO_PUBLIC_STAGENATION_SUPABASE_URL=https://your-project.supabase.co\n' +
      'EXPO_PUBLIC_STAGENATION_SUPABASE_ANON_KEY=your-anon-key'
    );
    // Use a placeholder URL so createClient doesn't throw during module load.
    // All requests will fail gracefully instead of crashing the app on startup.
    return createClient('https://placeholder.supabase.co', 'placeholder-key', {
      auth: {
        storage: ExpoSecureStoreAdapter,
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

export const supabase = createSupabaseClient();
