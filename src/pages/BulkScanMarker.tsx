import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { SharedLogin } from '../components/SharedLogin';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export function BulkScanMarker() {
  const { user, isSuperAdmin, loading: authLoading } = useAuth();
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  if (authLoading) return null;
  if (!user) return <SharedLogin />;
  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-400">Alleen super_admin heeft toegang.</p>
      </div>
    );
  }

  const log = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const runBulkScan = async () => {
    setRunning(true);
    setError('');
    setLogs([]);
    setDone(false);

    try {
      log('Edge function aanroepen...');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Niet ingelogd');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/bulk-mark-scanned`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || `HTTP ${res.status}`);
      }

      if (result.summary && Array.isArray(result.summary)) {
        result.summary.forEach((line: string) => log(line));
      }

      log(`Totaal tickets: ${result.totalTickets || 0}`);
      log(`Totaal stoeltickets: ${result.totalSeatTickets || 0}`);
      log(`DZ stoelen gevonden: ${result.dzSeatsFound || 0}`);
      log('KLAAR - Alle tickets zijn als gescand gemarkeerd.');
      setDone(true);
    } catch (err: any) {
      setError(err.message || 'Onbekende fout');
      log(`FOUT: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Bulk Scan Marker</h1>
        <p className="text-slate-400 mb-6">
          Markeert alle tickets als gescand op zondag 21 juni 2026.
          Tijden: 11:00 en 14:15. Rij DZ stoelen 10-17: tussen 13:00 en 13:20.
        </p>

        {!done && (
          <button
            onClick={runBulkScan}
            disabled={running}
            className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-bold transition-colors flex items-center gap-2"
          >
            {running ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Bezig...
              </>
            ) : (
              'Start Bulk Scan'
            )}
          </button>
        )}

        {done && (
          <div className="flex items-center gap-2 px-4 py-3 bg-green-500/10 border border-green-500/30 rounded-lg mb-4">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <span className="text-green-400 font-medium">Alle tickets zijn gemarkeerd als gescand.</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg mb-4 mt-4">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <span className="text-red-400">{error}</span>
          </div>
        )}

        {logs.length > 0 && (
          <div className="mt-6 bg-slate-800 border border-slate-700 rounded-lg p-4 font-mono text-sm space-y-1 max-h-96 overflow-y-auto">
            {logs.map((line, i) => (
              <div key={i} className="text-slate-300">{line}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
