import { useState } from 'react';
import { Shield, LogIn, AlertCircle, ArrowLeft, Mail, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';

export function SharedLogin() {
  const { login, loading, error, getRedirectPath } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localLoading, setLocalLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetAttempts, setResetAttempts] = useState(0);
  const [lastResetAttempt, setLastResetAttempt] = useState(0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setLocalLoading(true);

    try {
      const result = await login(email, password);

      if (result.success) {
        const redirect = getRedirectPath();
        window.location.href = '/' + redirect.replace(/^\/+/, '');
      } else {
        setLoginError(result.error || 'Login failed');
      }
    } catch (err: any) {
      setLoginError(err.message || 'An unexpected error occurred');
    } finally {
      setLocalLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setResetError(null);

    // SECURITY: Client-side rate limiting for password reset
    const now = Date.now();
    if (now - lastResetAttempt > 300_000) {
      setResetAttempts(0);
    }
    if (resetAttempts >= 3) {
      const cooldownMs = Math.min(1000 * Math.pow(2, resetAttempts - 3), 60_000);
      const elapsed = now - lastResetAttempt;
      if (elapsed < cooldownMs) {
        const waitSec = Math.ceil((cooldownMs - elapsed) / 1000);
        setResetError(`Te veel pogingen. Wacht ${waitSec} seconden.`);
        return;
      }
    }
    setResetAttempts(prev => prev + 1);
    setLastResetAttempt(now);

    setResetSending(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/superadmin-reset`,
      });

      if (error && error.status !== 429) {
        const isRealError = error.message &&
          !error.message.toLowerCase().includes('rate') &&
          !error.message.toLowerCase().includes('too many');

        if (isRealError) {
          setResetError(error.message);
          return;
        }
      }
      setResetSent(true);
    } catch (err: any) {
      setResetError(err.message || 'Er is een fout opgetreden');
    } finally {
      setResetSending(false);
    }
  }

  function handleBackToLogin() {
    setShowForgotPassword(false);
    setResetEmail('');
    setResetSent(false);
    setResetError(null);
  }

  const displayError = loginError || error;
  const isLoading = localLoading || loading;

  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="bg-slate-800/80 backdrop-blur border-2 border-slate-600 rounded-2xl p-8 shadow-2xl">
            <button
              onClick={handleBackToLogin}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Terug naar login
            </button>

            <div className="flex items-center justify-center gap-3 mb-6">
              <Mail className="w-10 h-10 text-red-500" />
              <h1 className="text-2xl font-bold text-white">
                Wachtwoord vergeten
              </h1>
            </div>

            {resetSent ? (
              <div className="text-center">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-400" />
                </div>
                <h2 className="text-xl font-semibold text-white mb-2">Email verstuurd!</h2>
                <p className="text-slate-400 mb-6">
                  We hebben een link gestuurd naar <span className="text-white font-medium">{resetEmail}</span> om je wachtwoord te resetten.
                </p>
                <p className="text-sm text-slate-500 mb-6">
                  Check ook je spam folder als je de email niet ziet.
                </p>
                <button
                  onClick={handleBackToLogin}
                  className="w-full px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold transition-colors text-white"
                >
                  Terug naar login
                </button>
              </div>
            ) : (
              <>
                <p className="text-slate-400 text-center mb-6">
                  Vul je email in en we sturen je een link om je wachtwoord te resetten.
                </p>

                {resetError && (
                  <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-red-400 text-sm">{resetError}</p>
                  </div>
                )}

                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-white">Email</label>
                    <input
                      type="email"
                      required
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                      placeholder="je@email.com"
                      disabled={resetSending}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={resetSending}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors text-white"
                  >
                    {resetSending ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Versturen...
                      </>
                    ) : (
                      <>
                        <Mail className="w-5 h-5" />
                        Verstuur reset link
                      </>
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-slate-800/80 backdrop-blur border-2 border-slate-600 rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center justify-center gap-3 mb-8">
            <Shield className="w-12 h-12 text-red-500" />
            <h1 className="text-3xl font-bold text-white">
              Login
            </h1>
          </div>

          {displayError && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{displayError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2 text-white">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                placeholder="je@email.com"
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-white">Wachtwoord</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white placeholder:text-white/50"
                placeholder="••••••••"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="mt-2 text-sm text-slate-400 hover:text-red-400 transition-colors"
              >
                Wachtwoord vergeten?
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors text-white"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Inloggen...
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  Inloggen
                </>
              )}
            </button>
          </form>

          <p className="text-sm text-slate-400 text-center mt-6">
            Je wordt automatisch doorgestuurd naar het juiste panel
          </p>
        </div>
      </div>
    </div>
  );
}
