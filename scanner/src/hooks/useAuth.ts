import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let resolved = false;

    const resolve = (s: Session | null) => {
      if (!mounted || resolved) return;
      resolved = true;
      setSession(s);
      setLoading(false);
    };

    // Hard timeout: never hang longer than 2 seconds
    const timeout = setTimeout(() => {
      console.warn('[StageNation] Auth check timed out after 2s, continuing without session');
      resolve(null);
    }, 2000);

    supabase.auth.getSession()
      .then(({ data: { session } }) => resolve(session))
      .catch((err) => {
        console.warn('[StageNation] Auth getSession failed:', err?.message);
        resolve(null);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setSession(session);
        if (!resolved) {
          resolved = true;
          setLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { session, loading, signIn, signOut };
}
