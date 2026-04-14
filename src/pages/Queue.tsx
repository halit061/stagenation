import { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, Users, Loader2 } from 'lucide-react';
import { joinQueue, type QueueStatus } from '../lib/queueClient';
import { useLanguage } from '../contexts/LanguageContext';

const QUEUE_POLL_MIN = 2000;
const QUEUE_POLL_MAX = 15000;
const QUEUE_POLL_FACTOR = 1.3;

interface QueueProps {
  onNavigate: (page: string) => void;
}

export function Queue({ onNavigate }: QueueProps) {
  const { language } = useLanguage();
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [positionStart, setPositionStart] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventIdRef = useRef<string | null>(null);

  const txt = useCallback((translations: Record<string, string>) => {
    return translations[language || 'nl'] || translations['nl'];
  }, [language]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get('event_id');
    if (!eventId) {
      onNavigate('tickets');
      return;
    }
    eventIdRef.current = eventId;
    let cancelled = false;
    let delay = QUEUE_POLL_MIN;

    const poll = async () => {
      if (cancelled) return;
      try {
        const status = await joinQueue(eventId);
        setQueueStatus(status);
        setError(null);

        if (status.status === 'waiting' && status.position > 0) {
          setPositionStart(prev => {
            if (prev === null || status.position > prev) return status.position;
            return prev;
          });
          if (status.position <= 5) {
            delay = QUEUE_POLL_MIN;
          } else {
            delay = Math.min(delay * QUEUE_POLL_FACTOR, QUEUE_POLL_MAX);
          }
        }

        if (status.status === 'admitted') {
          const eventSlug = params.get('event') || '';
          setTimeout(() => {
            onNavigate(eventSlug ? `tickets?event=${eventSlug}` : 'tickets');
          }, 1500);
          return;
        }
      } catch (err: any) {
        console.error('[Queue] Poll error:', err.message);
        setError('Verbindingsprobleem. We proberen opnieuw...');
        delay = Math.min(delay * 2, QUEUE_POLL_MAX);
      }
      if (!cancelled) {
        pollRef.current = setTimeout(poll, delay);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [onNavigate]);

  const progress = (() => {
    if (!queueStatus) return 0;
    if (queueStatus.status === 'admitted') return 1;
    if (positionStart === null || positionStart === 0) return 0;
    return Math.min(0.95, (positionStart - queueStatus.position) / positionStart);
  })();

  const progressPercent = Math.round(progress * 100);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-20">
      <div className="w-full max-w-md">
        <div className="bg-slate-800/60 backdrop-blur border border-slate-700 rounded-2xl p-8">
          <div className="text-center mb-8">
            {queueStatus?.status === 'admitted' ? (
              <>
                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-emerald-400" />
                </div>
                <h1 className="text-2xl font-bold text-emerald-400 mb-2">
                  {txt({ nl: 'Je bent aan de beurt!', tr: "It's your turn!", fr: "C'est votre tour!", de: 'Du bist dran!' })}
                </h1>
                <p className="text-slate-300">
                  {txt({ nl: 'Je wordt doorgestuurd...', tr: 'Redirecting...', fr: 'Redirection...', de: 'Weiterleitung...' })}
                </p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-cyan-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                </div>
                <h1 className="text-2xl font-bold mb-2">
                  {txt({ nl: 'Wachtrij', tr: 'Waiting Room', fr: "File d'attente", de: 'Warteschlange' })}
                </h1>
                <p className="text-slate-400 text-sm">
                  {txt({
                    nl: 'Er zijn veel bezoekers. Je wordt automatisch doorgelaten.',
                    tr: 'High traffic. You will be admitted automatically.',
                    fr: 'Trafic élevé. Vous serez admis automatiquement.',
                    de: 'Hoher Andrang. Du wirst automatisch zugelassen.',
                  })}
                </p>
              </>
            )}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-6 text-sm text-red-300 text-center">
              {error}
            </div>
          )}

          {queueStatus && queueStatus.status === 'waiting' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-cyan-400 mb-1">
                    {queueStatus.position}
                  </div>
                  <div className="text-xs text-slate-400 uppercase tracking-wider">
                    {txt({ nl: 'Positie', tr: 'Position', fr: 'Position', de: 'Position' })}
                  </div>
                </div>
                <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-3xl font-bold text-cyan-400 mb-1">
                    <Clock className="w-5 h-5" />
                    <span>~{queueStatus.eta_minutes}</span>
                  </div>
                  <div className="text-xs text-slate-400 uppercase tracking-wider">
                    {txt({ nl: 'Minuten', tr: 'Minutes', fr: 'Minutes', de: 'Minuten' })}
                  </div>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center text-xs text-slate-400 mb-2">
                  <span>{queueStatus.active_inside} / {queueStatus.cap}</span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="h-3 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${Math.max(progressPercent, 2)}%` }}
                  />
                </div>
              </div>

              <p className="text-center text-xs text-slate-500">
                {txt({
                  nl: 'Houd deze pagina open. Je wordt automatisch doorgestuurd.',
                  tr: 'Keep this page open. You will be redirected automatically.',
                  fr: 'Gardez cette page ouverte. Vous serez redirigé automatiquement.',
                  de: 'Lass diese Seite offen. Du wirst automatisch weitergeleitet.',
                })}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
