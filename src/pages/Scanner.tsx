import { QrCode, CheckCircle, XCircle, AlertTriangle, Camera, AlertCircle as AlertIcon, LogOut, RefreshCw } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { decodeQRData } from '../lib/crypto';
import { useAuth } from '../contexts/AuthContext';
import { SharedLogin } from '../components/SharedLogin';

interface ScanResult {
  valid: boolean;
  result: 'valid' | 'already_used' | 'invalid' | 'revoked' | 'expired';
  message: string;
  ticket?: {
    number: string;
    type: string;
    event: string;
    holder: string;
  };
}

interface DbStats {
  total: number;
  used: number;
  valid: number;
}

export function Scanner() {
  const { user, role, loading: authLoading, isScanner, logout, getRedirectPath } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [stats, setStats] = useState({ scanned: 0, valid: 0, invalid: 0 });
  const [dbStats, setDbStats] = useState<DbStats | null>(null);
  const [dbStatsLoading, setDbStatsLoading] = useState(false);

  // SECURITY: Filter ticket stats by status only (not select('*')) and use 'id' for count
  const fetchDbStats = useCallback(async () => {
    setDbStatsLoading(true);
    try {
      const { count: totalCount } = await supabase
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .in('status', ['valid', 'used']);

      const { count: usedCount } = await supabase
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'used');

      const { count: validCount } = await supabase
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'valid');

      setDbStats({
        total: totalCount ?? 0,
        used: usedCount ?? 0,
        valid: validCount ?? 0,
      });
    } catch {
      // silent fail
    } finally {
      setDbStatsLoading(false);
    }
  }, []);

  const validateTicket = async (qrData: string) => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        throw new Error('Niet ingelogd');
      }

      const decoded = decodeQRData(qrData);

      let response: Response;

      // SECURITY: Don't send full userAgent - only send minimal device identifier
      const deviceId = `scanner-${user?.id?.substring(0, 8) || 'unknown'}`;

      if (decoded) {
        const apiUrl = `${supabaseUrl}/functions/v1/validate-ticket`;
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ticketId: decoded.tid,
            token: decoded.tok,
            locationId: 'main-entrance',
            deviceInfo: { device: deviceId },
          }),
        });
      } else {
        const apiUrl = `${supabaseUrl}/functions/v1/unified-scan`;
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code: qrData.trim(),
            scanner_user_id: user?.id,
            device_info: { device: deviceId },
          }),
        });
      }

      if (!response.ok) {
        throw new Error('Validatie mislukt');
      }

      const rawResult = await response.json();

      let result: ScanResult;
      if (decoded) {
        result = rawResult;
      } else {
        const isValid = rawResult.status === 'OK';
        const isAlreadyUsed = rawResult.status === 'ALREADY_USED';
        result = {
          valid: isValid,
          result: isValid ? 'valid' : isAlreadyUsed ? 'already_used' : 'invalid',
          message: rawResult.message || (isValid ? 'Ticket geldig' : 'Ticket ongeldig'),
          ticket: rawResult.details ? {
            number: rawResult.details.ticket_number || rawResult.details.guest_name || '',
            type: rawResult.type || '',
            event: rawResult.details.event_name || '',
            holder: rawResult.details.holder_name || rawResult.details.guest_name || '',
          } : undefined,
        };
      }

      setLastResult(result);

      setStats(prev => ({
        scanned: prev.scanned + 1,
        valid: prev.valid + (result.valid ? 1 : 0),
        invalid: prev.invalid + (result.valid ? 0 : 1),
      }));

      if (result.valid) {
        fetchDbStats();
      }

      return result;
    } catch (error) {
      const errorResult: ScanResult = {
        valid: false,
        result: 'invalid',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      };
      setLastResult(errorResult);
      setStats(prev => ({ ...prev, scanned: prev.scanned + 1, invalid: prev.invalid + 1 }));
      return errorResult;
    }
  };

  useEffect(() => {
    if (user && isScanner()) {
      fetchDbStats();
    }
  }, [user, fetchDbStats, isScanner]);

  const handleManualScan = async () => {
    if (!manualCode) return;
    setScanning(true);
    await validateTicket(manualCode);
    setManualCode('');
    setScanning(false);
    fetchDbStats();
  };

  const ResultDisplay = ({ result }: { result: ScanResult }) => {
    const isValid = result.valid;
    const Icon = isValid ? CheckCircle : result.result === 'already_used' ? AlertTriangle : XCircle;
    const bgColor = isValid
      ? 'from-green-500/20 to-emerald-500/20 border-green-500/50'
      : result.result === 'already_used'
      ? 'from-orange-500/20 to-yellow-500/20 border-orange-500/50'
      : 'from-red-500/20 to-rose-500/20 border-red-500/50';
    const iconColor = isValid ? 'text-green-400' : result.result === 'already_used' ? 'text-orange-400' : 'text-red-400';

    return (
      <div className={`bg-gradient-to-br ${bgColor} border rounded-2xl p-8 text-center`}>
        <Icon className={`w-20 h-20 mx-auto mb-4 ${iconColor}`} />
        <h2 className="text-2xl font-bold mb-2">{result.message}</h2>
        {result.ticket && (
          <div className="mt-6 space-y-2 text-left bg-slate-900/50 rounded-xl p-4">
            <div className="flex justify-between">
              <span className="text-slate-400">Ticket:</span>
              <span className="font-mono">{result.ticket.number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Type:</span>
              <span>{result.ticket.type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Event:</span>
              <span>{result.ticket.event}</span>
            </div>
            {result.ticket.holder && (
              <div className="flex justify-between">
                <span className="text-slate-400">Houder:</span>
                <span>{result.ticket.holder}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (authLoading) {
    return (
      <div className="py-20 px-4 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white">Laden...</p>
        </div>
      </div>
    );
  }

  if (!user || !role) {
    return <SharedLogin />;
  }

  if (!isScanner()) {
    const redirectPath = getRedirectPath();
    return (
      <div className="py-20 px-4 flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md">
          <AlertIcon className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-3xl font-bold mb-2 text-white">Geen toegang</h1>
          <p className="text-slate-400 mb-6">Je hebt geen toegang tot de Scanner functie.</p>
          <div className="flex flex-col gap-3">
            {redirectPath !== 'login' && (
              <a
                href={`/#${redirectPath}`}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-400 rounded-lg font-semibold transition-colors text-white"
              >
                Ga naar je dashboard
              </a>
            )}
            <button
              onClick={logout}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold transition-colors text-white"
            >
              <LogOut className="w-5 h-5" />
              Uitloggen
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-20 px-4 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <QrCode className="w-10 h-10 text-cyan-400" />
            <h1 className="text-4xl font-bold">Ticket Scanner</h1>
          </div>
          <p className="text-slate-400">Scan tickets om toegang te verlenen</p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-cyan-400 mb-1">{stats.scanned}</div>
            <div className="text-sm text-slate-400">Deze sessie</div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-green-400 mb-1">{stats.valid}</div>
            <div className="text-sm text-slate-400">Geldig</div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-red-400 mb-1">{stats.invalid}</div>
            <div className="text-sm text-slate-400">Ongeldig</div>
          </div>
        </div>

        <div className="bg-slate-800/80 border border-cyan-500/30 rounded-2xl p-5 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider">Totaal overzicht</h3>
            <button
              onClick={fetchDbStats}
              disabled={dbStatsLoading}
              className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors text-slate-400 hover:text-white disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${dbStatsLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {dbStats ? (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-900/60 rounded-xl p-4 text-center">
                <div className="text-4xl font-bold text-white mb-1">{dbStats.used}</div>
                <div className="text-xs text-slate-400">Gescand</div>
              </div>
              <div className="bg-slate-900/60 rounded-xl p-4 text-center">
                <div className="text-4xl font-bold text-slate-300 mb-1">{dbStats.valid}</div>
                <div className="text-xs text-slate-400">Nog te scannen</div>
              </div>
              <div className="bg-slate-900/60 rounded-xl p-4 text-center">
                <div className="text-4xl font-bold text-cyan-400 mb-1">{dbStats.total}</div>
                <div className="text-xs text-slate-400">Totaal tickets</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-16">
              <div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
            </div>
          )}
          {dbStats && dbStats.total > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Voortgang</span>
                <span>{Math.round((dbStats.used / dbStats.total) * 100)}%</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-green-500 rounded-full transition-all duration-500"
                  style={{ width: `${(dbStats.used / dbStats.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-8 mb-8">
          <div className="aspect-square max-w-md mx-auto bg-slate-900 rounded-2xl flex items-center justify-center border-2 border-dashed border-slate-700 mb-6">
            <div className="text-center">
              <Camera className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-500">Camera scan komt hier</p>
              <p className="text-xs text-slate-600 mt-2">Gebruik onderstaande manual input voor testing</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Manual QR Code Input</label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder='{"tid":"...","tok":"...","v":1}'
                  className="flex-1 px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-cyan-500 text-white font-mono text-sm"
                />
                <button
                  onClick={handleManualScan}
                  disabled={!manualCode || scanning}
                  className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
                >
                  Scan
                </button>
              </div>
            </div>
          </div>
        </div>

        {lastResult && (
          <div className="mb-8">
            <ResultDisplay result={lastResult} />
          </div>
        )}

        <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6">
          <h3 className="font-bold mb-4 text-cyan-400">Scanner Instructies</h3>
          <ul className="space-y-2 text-sm text-slate-300">
            <li className="flex items-start space-x-2">
              <span className="text-cyan-400 mt-1">•</span>
              <span>Houd de QR-code voor de camera totdat deze wordt gescand</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-cyan-400 mt-1">•</span>
              <span>Groene melding = ticket geldig, persoon mag binnen</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-cyan-400 mt-1">•</span>
              <span>Oranje melding = ticket al gescand, roep supervisor</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-cyan-400 mt-1">•</span>
              <span>Rode melding = ticket ongeldig, geen toegang</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-cyan-400 mt-1">•</span>
              <span>Bij problemen: noteer ticketnummer en roep supervisor</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
