import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const supabaseUrl = 'https://sbukyajfeqjkloeyjieh.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNidWt5YWpmZXFqa2xvZXlqaWVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTkyMDQsImV4cCI6MjA4ODgzNTIwNH0.S-JuzqkoVzUpTwLp45IK9nRXdSBm5d-1jgVD8v0RbMQ';

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

const ExpoSecureStoreAdapter = {
  getItem: (key: string) =>
    withTimeout(
      SecureStore.getItemAsync(key).catch(() => null),
      1000,
      null
    ),
  setItem: (key: string, value: string) =>
    withTimeout(
      SecureStore.setItemAsync(key, value).catch(() => undefined),
      1000,
      undefined
    ),
  removeItem: (key: string) =>
    withTimeout(
      SecureStore.deleteItemAsync(key).catch(() => undefined),
      1000,
      undefined
    ),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: (url, options = {}) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeout));
    },
  },
});
