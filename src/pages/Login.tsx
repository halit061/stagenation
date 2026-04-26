import { Shield, LogIn, AlertCircle, Loader2, ArrowLeft, Mail, CheckCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface LoginProps {
  onNavigate?: (page: string) => void;
}

export function Login({ onNavigate }: LoginProps) {
  const { user, role, loading, login, getRedirectPath } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetAttempts, setResetAttempts] = useState<{ count: number; lastAttempt: number }>({ count: 0, lastAttempt: 0 });

  useEffect(() => {
    if (!loading && user && role) {
      const redirectPath = getRedirectPath();
      if (onNavigate) {
        onNavigate(redirectPath);
      } else {
        window.location.href = '/' + redirectPath.replace(/^\/+/, '');
      }
    }
  }, [loading, user, role, onNavigate, getRedirectPath]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setIsSubmitting(true);

    const result = await login(email, password);

    if (!result.success) {
      setLoginError(result.error || 'Login failed');
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setResetError(null);

    // SECURITY: Client-side rate limiting for password reset
    const now = Date.now();
    const attempts = { ...resetAttempts };
    if (now - attempts.lastAttempt > 600_000) {
      attempts.count = 0; // Reset after 10 minutes
    }
    if (attempts.count >= 3) {
      const cooldownMs = Math.min(60_000 * Math.pow(2, attempts.count - 3), 300_000);
      const elapsed = now - attempts.lastAttempt;
      if (elapsed < cooldownMs) {
        const waitSec = Math.ceil((cooldownMs - elapsed) / 1000);
        setResetError(`Te veel pogingen. Wacht ${waitSec} seconden.`);
        return;
      }
    }
    attempts.count++;
    attempts.lastAttempt = now;
    setResetAttempts(attempts);

    // SECURITY: Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(resetEmail.trim())) {
      setResetError('Ongeldig e-mailadres');
      return;
    }

    setResetSending(true);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/request-password-reset`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: resetEmail.trim() }),
      });

      if (!response.ok) {
        console.error('[Login] Reset error: HTTP', response.status);
        setResetError('Er is een fout opgetreden. Probeer het later opnieuw.');
        return;
      }
      setResetSent(true);
    } catch (err: any) {
      console.error('[Login] Reset exception:', err.message);
      setResetError('Er is een fout opgetreden. Probeer het later opnieuw.');
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white">Laden...</p>
        </div>
      </div>
    );
  }

  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full border border-slate-700">
          <button
            onClick={handleBackToLogin}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Terug naar login
          </button>

          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500/20 rounded-full mb-4">
              <Mail className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Wachtwoord vergeten</h1>
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
                  <label className="block text-sm font-medium text-white mb-2">Email</label>
                  <input
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-red-500 text-white"
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
                      <Loader2 className="w-5 h-5 animate-spin" />
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
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl p-8 max-w-md w-full border border-slate-700">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500/20 rounded-full mb-4">
            <Shield className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Login</h1>
          <p className="text-slate-400 mt-2">Log in om door te gaan</p>
        </div>

        {loginError && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-400 text-sm">{loginError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white mb-2">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-red-500 text-white"
              placeholder="je@email.com"
              disabled={isSubmitting}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-2">Wachtwoord</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg focus:outline-none focus:border-red-500 text-white"
              placeholder="••••••••"
              disabled={isSubmitting}
            />
          </div>
          <div className="text-right">
            <button
              type="button"
              onClick={() => setShowForgotPassword(true)}
              className="text-sm text-red-400 hover:text-red-300 transition-colors underline"
            >
              Wachtwoord vergeten?
            </button>
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors text-white"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
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
      </div>
    </div>
  );
}
