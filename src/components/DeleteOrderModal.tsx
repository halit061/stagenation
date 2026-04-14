import { useState } from 'react';
import { AlertTriangle, Trash2, X, Loader2, ChevronRight } from 'lucide-react';

const REASON_OPTIONS = [
  { value: 'duplicate', label: 'Dubbele bestelling' },
  { value: 'fraud', label: 'Fraude / Verdachte bestelling' },
  { value: 'customer_request', label: 'Klant wil niet meer komen' },
  { value: 'wrong_event', label: 'Verkeerd event geboekt' },
  { value: 'test_order', label: 'Testbestelling' },
  { value: 'other', label: 'Anders...' },
];

interface DeleteOrderModalProps {
  orderNumber: string;
  payerName: string;
  payerEmail: string;
  totalAmount: number;
  ticketCount: number;
  seatCount: number;
  eventName: string;
  loading: boolean;
  onConfirm: (reason: string, notes: string) => void;
  onClose: () => void;
}

export function DeleteOrderModal({
  orderNumber,
  payerName,
  payerEmail,
  totalAmount,
  ticketCount,
  seatCount,
  eventName,
  loading,
  onConfirm,
  onClose,
}: DeleteOrderModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [reason, setReason] = useState('');
  const [customNotes, setCustomNotes] = useState('');
  const [confirmText, setConfirmText] = useState('');

  const eventNameMatch = confirmText.trim().toLowerCase() === eventName.trim().toLowerCase();
  const totalEur = (totalAmount / 100).toFixed(2);
  const itemCount = seatCount > 0 ? seatCount : ticketCount;

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 bg-red-500/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-red-500/20 flex items-center justify-center">
              <Trash2 className="w-4.5 h-4.5 text-red-400" />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm">Tickets Verwijderen</h3>
              <p className="text-red-400/70 text-xs">Stap {step} van 3</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="w-full h-1 bg-slate-700">
          <div
            className="h-full bg-red-500 transition-all duration-300"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        <div className="p-5">
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-400 text-sm font-medium">Let op: deze actie is onomkeerbaar</p>
                  <p className="text-red-400/70 text-xs mt-1">
                    Alle tickets worden geannuleerd, stoelen worden vrijgegeven en de analytics worden bijgewerkt.
                  </p>
                </div>
              </div>

              <div className="bg-slate-900/60 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Bestelling</span>
                  <span className="font-mono text-cyan-400">{orderNumber}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Klant</span>
                  <span className="text-white">{payerName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">E-mail</span>
                  <span className="text-slate-300 truncate ml-4">{payerEmail}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Tickets</span>
                  <span className="text-white">{itemCount}</span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-slate-700">
                  <span className="text-slate-400 font-medium">Bedrag</span>
                  <span className="text-white font-bold">{'\u20AC'}{totalEur}</span>
                </div>
              </div>

              <button
                onClick={() => setStep(2)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-500 text-white font-medium rounded-xl transition-colors text-sm"
              >
                Doorgaan
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Reden voor verwijdering
                </label>
                <select
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:border-red-500 focus:outline-none appearance-none"
                >
                  <option value="">Selecteer een reden...</option>
                  {REASON_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {reason === 'other' && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Toelichting
                  </label>
                  <textarea
                    value={customNotes}
                    onChange={e => setCustomNotes(e.target.value)}
                    placeholder="Beschrijf de reden..."
                    rows={3}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:border-red-500 focus:outline-none resize-none"
                  />
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  Terug
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!reason || (reason === 'other' && !customNotes.trim())}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors text-sm"
                >
                  Doorgaan
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-red-400 text-sm">
                  Typ de naam van het event om te bevestigen:
                </p>
                <p className="text-white font-bold text-base mt-1">{eventName}</p>
              </div>

              <input
                type="text"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="Typ de eventnaam..."
                className={`w-full px-3 py-2.5 bg-slate-700 border rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none ${
                  confirmText.length > 0
                    ? eventNameMatch
                      ? 'border-green-500 focus:border-green-500'
                      : 'border-red-500 focus:border-red-500'
                    : 'border-slate-600 focus:border-red-500'
                }`}
                autoFocus
              />

              <div className="flex gap-2">
                <button
                  onClick={() => setStep(2)}
                  disabled={loading}
                  className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
                >
                  Terug
                </button>
                <button
                  onClick={() => {
                    const label = REASON_OPTIONS.find(o => o.value === reason)?.label || reason;
                    const notes = reason === 'other' ? customNotes : '';
                    onConfirm(label, notes);
                  }}
                  disabled={!eventNameMatch || loading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors text-sm"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Verwijderen...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Definitief Verwijderen
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
