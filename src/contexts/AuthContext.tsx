import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { supabase, verifySession } from '../lib/supabaseClient';

// SECURITY: Superadmin emails are no longer hardcoded in the client bundle.
// The super_admin role is determined entirely by the server-side user_roles table.
// Client-side checks rely solely on the role field from the database.

export type UserRole = 'super_admin' | 'admin' | 'scanner' | null;

interface AuthState {
  user: any | null;
  role: UserRole;
  loading: boolean;
  error: string | null;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  isSuperAdmin: () => boolean;
  isAdmin: () => boolean;
  isScanner: () => boolean;
  canManageRoles: () => boolean;
  getRedirectPath: () => string;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    role: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setState({ user: null, role: null, loading: false, error: null });
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        checkAuth();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // SECURITY: Real-time role subscription - detect role changes while logged in
  useEffect(() => {
    if (!state.user) return;

    const channel = supabase
      .channel('role-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_roles',
          filter: `user_id=eq.${state.user.id}`,
        },
        () => {
          // Re-check auth when role changes
          checkAuth();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [state.user?.id]);

  async function checkAuth() {
    try {
      const sessionCheck = await verifySession();

      if (!sessionCheck.valid || !sessionCheck.session) {
        setState({ user: null, role: null, loading: false, error: null });
        return;
      }

      const user = sessionCheck.session.user;
      const role = await fetchUserRole(user.id, user.email);

      setState({ user, role, loading: false, error: null });
    } catch (error: any) {
      console.error('[AuthContext] Auth check error:', error);
      setState({ user: null, role: null, loading: false, error: error.message });
    }
  }

  async function fetchUserRole(userId: string, _email: string): Promise<UserRole> {
    const { data: roleResults, error } = await supabase
      .from('user_roles')
      .select('role, is_active')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(10000);

    if (error || !roleResults || roleResults.length === 0) {
      return null;
    }

    // SECURITY: Role is determined by the database role field, not client-side email checks
    const hasSuperAdmin = roleResults.some(r => r.role === 'super_admin');
    const hasAdmin = roleResults.some(r => r.role === 'admin');
    const hasScanner = roleResults.some(r => r.role === 'scanner');

    if (hasSuperAdmin) {
      return 'super_admin';
    }
    if (hasAdmin) {
      return 'admin';
    }
    if (hasScanner) {
      return 'scanner';
    }

    return null;
  }

  const loginAttemptsRef = useRef({ count: 0, lastAttempt: 0 });

  async function login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const now = Date.now();
      const attempts = loginAttemptsRef.current;

      if (now - attempts.lastAttempt > 300_000) {
        attempts.count = 0;
      }

      if (attempts.count >= 5) {
        const cooldownMs = Math.min(1000 * Math.pow(2, attempts.count - 5), 30_000);
        const elapsed = now - attempts.lastAttempt;
        if (elapsed < cooldownMs) {
          const waitSec = Math.ceil((cooldownMs - elapsed) / 1000);
          return { success: false, error: `Te veel pogingen. Wacht ${waitSec} seconden.` };
        }
      }

      attempts.count++;
      attempts.lastAttempt = now;

      setState(prev => ({ ...prev, loading: true, error: null }));

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setState(prev => ({ ...prev, loading: false, error: error.message }));
        return { success: false, error: error.message };
      }

      if (!data.user) {
        setState(prev => ({ ...prev, loading: false, error: 'Login failed' }));
        return { success: false, error: 'Login failed' };
      }

      const role = await fetchUserRole(data.user.id, data.user.email || '');

      if (!role) {
        await supabase.auth.signOut();
        setState(prev => ({ ...prev, loading: false, error: 'No access role assigned' }));
        return { success: false, error: 'No access role assigned to this account' };
      }

      loginAttemptsRef.current = { count: 0, lastAttempt: 0 };
      setState({ user: data.user, role, loading: false, error: null });
      return { success: true };
    } catch (error: any) {
      setState(prev => ({ ...prev, loading: false, error: error.message }));
      return { success: false, error: error.message };
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    setState({ user: null, role: null, loading: false, error: null });
  }

  // SECURITY: Role checks rely solely on server-assigned database roles
  function isSuperAdmin(): boolean {
    return state.role === 'super_admin';
  }

  function isAdmin(): boolean {
    return state.role === 'super_admin' || state.role === 'admin';
  }

  function isScanner(): boolean {
    return state.role === 'super_admin' || state.role === 'admin' || state.role === 'scanner';
  }

  function canManageRoles(): boolean {
    return state.role === 'super_admin';
  }

  function getRedirectPath(): string {
    if (state.role === 'super_admin') return 'superadmin';
    if (state.role === 'admin') return 'admin';
    if (state.role === 'scanner') return 'scanner';
    return 'login';
  }

  async function refreshAuth() {
    await checkAuth();
  }

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        isSuperAdmin,
        isAdmin,
        isScanner,
        canManageRoles,
        getRedirectPath,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// SECURITY: Removed exported SUPERADMIN_EMAIL/SUPERADMIN_EMAILS constants
// Superadmin identification now relies solely on the database role field
