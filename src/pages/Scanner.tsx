import { QrCode, CheckCircle, XCircle, AlertTriangle, AlertCircle as AlertIcon, LogOut, RefreshCw, Zap, Volume2, VolumeX } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
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
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [stats, setStats] = useState({ scanned: 0, valid: 0, invalid: 0 });
  const [dbStats, setDbStats] = useState<DbStats | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [flashColor, setFlashColor] = useState<'green' | 'orange' | 'red' | null>(null);
  const [processing, setProcessing] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [scanCount, setScanCount] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number>(0);
  const lastScannedRef = useRef<string>('');
  const lastScannedTimeRef = useRef<number>(0);
  const processingRef = useRef(false);
  const userRef = useRef(user);
  userRef.current = user;

  function fetchDbStats() {
    supabase.from('tickets').select('id', { count: 'exact', head: true }).in('status', ['valid', 'used']).then(({ count: totalCount }) => {
      supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('status', 'used').then(({ count: usedCount }) => {
        supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('status', 'valid').then(({ count: validCount }) => {
          setDbStats({ total: totalCount ?? 0, used: usedCount ?? 0, valid: validCount ?? 0 });
        });
      });
    });
  }

  async function doValidate(qrData: string) {
    processingRef.current = true;
    setProcessing(true);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error('Niet ingelogd');

      const decoded = decodeQRData(qrData);
      const deviceId = `pwa-${userRef.current?.id?.substring(0, 8) || 'unknown'}`;
      let response: Response;

      if (decoded) {
        response = await fetch(`${supabaseUrl}/functions/v1/validate-ticket`, {
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
        response = await fetch(`${supabaseUrl}/functions/v1/unified-scan`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code: qrData.trim(),
            scanner_user_id: userRef.current?.id,
            device_info: { device: deviceId },
          }),
        });
      }

      if (!response.ok) throw new Error('Validatie mislukt');
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
        setFlashColor('green');
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        fetchDbStats();
      } else if (result.result === 'already_used') {
        setFlashColor('orange');
        if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
      } else {
        setFlashColor('red');
        if (navigator.vibrate) navigator.vibrate([500]);
      }
      setTimeout(() => setFlashColor(null), 600);
    } catch (error) {
      setLastResult({
        valid: false,
        result: 'invalid',
        message: error instanceof Error ? error.message : 'Onbekende fout',
      });
      setStats(prev => ({ ...prev, scanned: prev.scanned + 1, invalid: prev.invalid + 1 }));
      setFlashColor('red');
      if (navigator.vibrate) navigator.vibrate([500]);
      setTimeout(() => setFlashColor(null), 600);
    } finally {
      setProcessing(false);
      processingRef.current = false;
    }
  }

  function startScanning() {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);

    scanIntervalRef.current = window.setInterval(() => {
      if (processingRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      if (video.readyState < video.HAVE_ENOUGH_DATA) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

      const w = Math.min(vw, 640);
      const h = Math.round((vh / vw) * w);

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);

      const imageData = ctx.getImageData(0, 0, w, h);
      const code = jsQR(imageData.data, w, h, { inversionAttempts: 'attemptBoth' });

      setScanCount(c => c + 1);

      if (code && code.data) {
        const now = Date.now();
        if (code.data !== lastScannedRef.current || now - lastScannedTimeRef.current > 3000) {
          lastScannedRef.current = code.data;
          lastScannedTimeRef.current = now;
          doValidate(code.data);
        }
      }
    }, 200);
  }

  async function startCamera() {
    try {
      setCameraError(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
      }

      setCameraActive(true);
      startScanning();
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setCameraError('Camera toegang geweigerd. Geef toestemming in Safari instellingen.');
      } else if (err.name === 'NotFoundError') {
        setCameraError('Geen camera gevonden.');
      } else {
        setCameraError(`Camera fout: ${err.message}`);
      }
      setShowManual(true);
    }
  }

  function stopCamera() {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = 0;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  }

  useEffect(() => {
    if (user && isScanner()) {
      fetchDbStats();
      startCamera();
    }
    return () => { stopCamera(); };
  }, [user]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        stopCamera();
      } else if (userRef.current && isScanner()) {
        startCamera();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  if (authLoading) {
    return (
      <div className="fixed inset-0 bg-slate-900 flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !role) return <SharedLogin />;

  if (!isScanner()) {
    const redirectPath = getRedirectPath();
    return (
      <div className="fixed inset-0 bg-slate-900 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <AlertIcon className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-3xl font-bold mb-2 text-white">Geen toegang</h1>
          <p className="text-slate-400 mb-6">Je hebt geen scanner rol.</p>
          {redirectPath !== 'login' && (
            <a href={`/#${redirectPath}`} className="block px-6 py-3 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-semibold text-white text-center transition-colors mb-3">
              Ga naar dashboard
            </a>
          )}
          <button onClick={logout} className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold text-white transition-colors">
            <LogOut className="w-5 h-5" /> Uitloggen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black flex flex-col overflow-hidden">
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {flashColor && (
        <div className={`absolute inset-0 z-50 pointer-events-none ${
          flashColor === 'green' ? 'bg-green-500/30' :
          flashColor === 'orange' ? 'bg-orange-500/30' : 'bg-red-500/30'
        }`} />
      )}

      {/* Top bar */}
      <div className="relative z-10 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 pt-[env(safe-area-inset-top)] pb-3">
        <div className="flex items-center justify-between pt-3 mb-3">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-cyan-400" />
            <span className="font-bold text-white text-sm">Scanner</span>
            {processing && <Zap className="w-4 h-4 text-yellow-400 animate-pulse" />}
            <span className="text-[10px] text-slate-600 font-mono">{scanCount}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setSoundEnabled(!soundEnabled)} className="p-2 rounded-lg text-slate-400 hover:text-white">
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button onClick={() => setShowManual(!showManual)} className="p-2 rounded-lg text-slate-400 hover:text-white text-xs font-mono">
              ABC
            </button>
            <button onClick={logout} className="p-2 rounded-lg text-slate-400 hover:text-white">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-800/80 rounded-lg px-2 py-1.5 text-center">
            <div className="text-base font-bold text-cyan-400 leading-tight">{stats.scanned}</div>
            <div className="text-[9px] text-slate-500 uppercase">Sessie</div>
          </div>
          <div className="bg-slate-800/80 rounded-lg px-2 py-1.5 text-center">
            <div className="text-base font-bold text-green-400 leading-tight">{stats.valid}</div>
            <div className="text-[9px] text-slate-500 uppercase">Geldig</div>
          </div>
          <div className="bg-slate-800/80 rounded-lg px-2 py-1.5 text-center">
            <div className="text-base font-bold text-red-400 leading-tight">{stats.invalid}</div>
            <div className="text-[9px] text-slate-500 uppercase">Ongeldig</div>
          </div>
        </div>

        {dbStats && dbStats.total > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-green-500 rounded-full transition-all duration-500"
                style={{ width: `${(dbStats.used / dbStats.total) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-400 whitespace-nowrap font-mono">
              {dbStats.used}/{dbStats.total}
            </span>
            <button onClick={fetchDbStats} className="text-slate-500">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Camera */}
      <div className="flex-1 relative bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: 'translateZ(0)' }}
        />

        {cameraActive && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-64 relative">
              <div className="absolute top-0 left-0 w-10 h-10 border-t-[3px] border-l-[3px] border-cyan-400 rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-10 h-10 border-t-[3px] border-r-[3px] border-cyan-400 rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-10 h-10 border-b-[3px] border-l-[3px] border-cyan-400 rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-10 h-10 border-b-[3px] border-r-[3px] border-cyan-400 rounded-br-xl" />
              <div className="absolute top-1/2 left-4 right-4 h-[2px] bg-cyan-400/50 animate-pulse" />
            </div>
          </div>
        )}

        {cameraError && !cameraActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/95 px-6">
            <div className="text-center max-w-sm">
              <AlertIcon className="w-12 h-12 text-orange-400 mx-auto mb-3" />
              <p className="text-white font-medium mb-2 text-sm">{cameraError}</p>
              <button onClick={startCamera} className="mt-4 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-semibold text-white text-sm transition-colors">
                Opnieuw proberen
              </button>
            </div>
          </div>
        )}

        {!cameraActive && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
            <button onClick={startCamera} className="flex flex-col items-center gap-3 px-8 py-6 bg-cyan-600 hover:bg-cyan-500 rounded-2xl font-semibold text-white transition-colors">
              <QrCode className="w-10 h-10" />
              <span>Start Scanner</span>
            </button>
          </div>
        )}
      </div>

      {showManual && (
        <div className="relative z-10 bg-slate-900/95 border-t border-slate-700 px-4 py-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && manualCode.trim()) { doValidate(manualCode.trim()); setManualCode(''); } }}
              placeholder="Plak QR code data..."
              className="flex-1 px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={() => { if (manualCode.trim()) { doValidate(manualCode.trim()); setManualCode(''); } }}
              disabled={!manualCode.trim() || processing}
              className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg font-semibold text-white text-sm transition-colors"
            >
              Scan
            </button>
          </div>
        </div>
      )}

      {lastResult && (
        <div className={`relative z-10 border-t px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+16px)] ${
          lastResult.valid
            ? 'bg-green-950/95 border-green-800/50'
            : lastResult.result === 'already_used'
            ? 'bg-orange-950/95 border-orange-800/50'
            : 'bg-red-950/95 border-red-800/50'
        }`}>
          <div className="flex items-center gap-3">
            {lastResult.valid ? (
              <CheckCircle className="w-10 h-10 text-green-400 shrink-0" />
            ) : lastResult.result === 'already_used' ? (
              <AlertTriangle className="w-10 h-10 text-orange-400 shrink-0" />
            ) : (
              <XCircle className="w-10 h-10 text-red-400 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white text-lg leading-tight truncate">{lastResult.message}</p>
              {lastResult.ticket && (
                <p className="text-sm text-white/70 truncate mt-0.5">
                  {lastResult.ticket.holder || lastResult.ticket.number}
                  {lastResult.ticket.type && ` \u2022 ${lastResult.ticket.type}`}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
