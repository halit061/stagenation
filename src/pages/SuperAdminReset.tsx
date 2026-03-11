import { Shield, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export function SuperAdminReset() {
  const [loading, setLoading] = useState(true);
  const [validSession, setValidSession] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [passwordForm, setPasswordForm] = useState({
    password: '',
    confirmPassword: '',
  });

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setValidSession(true);
        setLoading(false);
      } else if (event === 'SIGNED_IN' && session) {
        setValidSession(true);
        setLoading(false);
      }
    });

    checkSession();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function checkSession() {
    try {
      const hash = window.location.hash;
      if (hash && (hash.includes('type=recovery') || hash.includes('access_token'))) {
        return;
      }

      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        console.error('[SuperAdminReset] Session error:', error);
        setValidSession(false);
        setLoading(false);
        return;
      }

      if (!session) {
        setValidSession(false);
        setLoading(false);
        return;
      }

      setValidSession(true);
      setLoading(false);
    } catch (error) {
      console.error('[SuperAdminReset] Error checking session:', error);
      setValidSession(false);
      setLoading(false);
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (passwordForm.password.length < 12) {
      setError('Wachtwoord moet minimaal 12 karakters bevatten');
      return;
    }

    // SECURITY: Enforce password complexity
    const hasUpperCase = /[A-Z]/.test(passwordForm.password);
    const hasLowerCase = /[a-z]/.test(passwordForm.password);
    const hasNumbers = /[0-9]/.test(passwordForm.password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(passwordForm.password);

    if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
      setError('Wachtwoord moet hoofdletters, kleine letters, cijfers en speciale tekens bevatten');
      return;
    }

    if (passwordForm.password !== passwordForm.confirmPassword) {
      setError('Wachtwoorden komen niet overeen');
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.password,
      });

      if (error) {
        console.error('[SuperAdminReset] Update password error:', error);
        throw error;
      }

      setPasswordUpdated(true);
    } catch (error: any) {
      console.error('[SuperAdminReset] Error updating password:', error);
      setError(error.message || 'Er is een fout opgetreden bij het bijwerken van je wachtwoord');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
        <div className="text-center">
          <Shield className="w-16 h-16 text-red-400 mx-auto mb-4 animate-pulse" />
          <p className="text-slate-400">Sessie controleren...</p>
        </div>
      </div>
    );
  }

  if (!validSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-8 shadow-2xl text-center">
            <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Ongeldige resetlink</h1>
            <p className="text-slate-400 mb-6">
              Deze resetlink is ongeldig of verlopen. Vraag een nieuwe herstelmail aan.
            </p>
            <a
              href="/login"
              className="inline-block px-6 py-3 bg-red-500 hover:bg-red-400 rounded-lg font-semibold transition-colors"
            >
              Terug naar login
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (passwordUpdated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-8 shadow-2xl text-center">
            <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Wachtwoord gewijzigd!</h1>
            <p className="text-slate-400 mb-6">
              Je wachtwoord is succesvol gewijzigd. Je kunt nu inloggen met je nieuwe wachtwoord.
            </p>
            <a
              href="/login"
              className="inline-block px-6 py-3 bg-red-500 hover:bg-red-400 rounded-lg font-semibold transition-colors"
            >
              Naar login
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center justify-center gap-3 mb-8">
            <Shield className="w-12 h-12 text-red-500" />
            <h1 className="text-3xl font-bold">
              Nieuw <span className="text-red-400">Wachtwoord</span>
            </h1>
          </div>

          <p className="text-slate-400 text-center mb-6">
            Voer je nieuwe wachtwoord in.
          </p>

          {error && (
            <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">
                Nieuw wachtwoord
              </label>
              <input
                type="password"
                required
                minLength={12}
                value={passwordForm.password}
                onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-red-500 text-white"
                placeholder="Minimaal 12 karakters"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">
                Bevestig wachtwoord
              </label>
              <input
                type="password"
                required
                minLength={12}
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-red-500 text-white"
                placeholder="Herhaal wachtwoord"
              />
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-400 rounded-lg font-semibold transition-colors"
            >
              Wachtwoord opslaan
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
