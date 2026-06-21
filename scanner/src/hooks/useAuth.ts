import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const resolved = useRef(false);

  useEffect(() => {
    let mounted = true;

    const done = (s: Session | null) => {
      if (!mounted || resolved.current) return;
      resolved.current = true;
      setSession(s);
      setLoading(false);
    };

    // Hard timeout: if auth doesn't resolve in 1.5s, show login
    const timer = setTimeout(() => done(null), 1500);

    supabase.auth.getSession()
      .then(({ data }) => done(data.session))
      .catch(() => done(null));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (mounted) {
        setSession(sess);
        if (!resolved.current) {
          resolved.current = true;
          setLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      clearTimeout(timer);
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
