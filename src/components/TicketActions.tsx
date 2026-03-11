import { useState } from 'react';
import { Mail, Trash2, X, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { EDGE_FUNCTION_BASE_URL } from '../config/brand';
import { useToast } from './Toast';

interface TicketActionsProps {
  ticketId: string;
  ticketNumber: string;
  holderName?: string;
  holderEmail?: string;
  status?: string;
  scanStatus?: string;
  onActionComplete?: () => void;
  variant?: 'buttons' | 'icons';
}

export function TicketActions({
  ticketId,
  ticketNumber,
  holderName,
  holderEmail,
  status,
  scanStatus,
  onActionComplete,
  variant = 'icons'
}: TicketActionsProps) {
  const { showToast } = useToast();
  const [showResendModal, setShowResendModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const wasScanned = status === 'used' || scanStatus === 'scanned';

  async function handleResendEmail() {
    setActionLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('Niet ingelogd');

      const response = await fetch(
        `${EDGE_FUNCTION_BASE_URL}/eskiler-resend-ticket-email`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ticket_id: ticketId }),
        }
      );

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || `Server error: ${response.status}`);
      }

      showToast(`Email verstuurd naar ${result.recipient}`, 'success');
      setShowResendModal(false);
      onActionComplete?.();
    } catch (error: any) {
      showToast(`Fout (${error.message})`, 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteTicket() {
    setActionLoading(true);
    try {
      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .select('*, orders(id, status)')
        .eq('id', ticketId)
        .maybeSingle();

      if (ticketError) throw new Error(ticketError.message);
      if (!ticket) throw new Error('Ticket niet gevonden');

      const orderId = ticket.order_id;
      const isGuestTicket = ticket.orders?.status === 'comped';

      const { error: deleteError } = await supabase
        .from('tickets')
        .delete()
        .eq('id', ticketId);

      if (deleteError) throw new Error(deleteError.message);

      setShowDeleteModal(false);
      onActionComplete?.();

      if (isGuestTicket && orderId) {
        await supabase
          .from('guest_ticket_qrs')
          .delete()
          .eq('order_id', orderId);

        const { data: remainingTickets } = await supabase
          .from('tickets')
          .select('id')
          .eq('order_id', orderId)
          .limit(1);

        if (!remainingTickets || remainingTickets.length === 0) {
          // Delete email_logs before order (FK RESTRICT)
          await supabase
            .from('email_logs')
            .delete()
            .eq('order_id', orderId);
          await supabase
            .from('orders')
            .delete()
            .eq('id', orderId);
        }
      }
    } catch (error: any) {
      showToast(`Fout: ${error.message || 'Onbekende fout'}`, 'error');
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <>
      {variant === 'icons' ? (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowResendModal(true)}
            className="p-2 bg-cyan-500/20 hover:bg-cyan-500/30 rounded-lg text-cyan-400 transition-colors"
            title="Opnieuw versturen"
          >
            <Mail className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="p-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-400 transition-colors"
            title="Verwijderen"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-600">
          <button
            onClick={() => setShowResendModal(true)}
            className="flex items-center gap-2 px-3 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 rounded-lg text-cyan-400 text-sm font-medium transition-colors"
          >
            <Mail className="w-4 h-4" />
            Opnieuw versturen
          </button>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center gap-2 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-400 text-sm font-medium transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Verwijderen
          </button>
        </div>
      )}

      {showResendModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowResendModal(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Email Opnieuw Versturen</h3>
              <button
                onClick={() => setShowResendModal(false)}
                className="p-2 hover:bg-slate-700 rounded-lg text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 mb-6">
              <p className="text-slate-300">
                Weet je zeker dat je de ticket email opnieuw wilt versturen?
              </p>
              <div className="bg-slate-900 rounded-lg p-4 space-y-2">
                <p className="text-sm text-slate-400">
                  <span className="text-slate-500">Ticket:</span>{' '}
                  <span className="text-cyan-400 font-mono">{ticketNumber}</span>
                </p>
                {holderName && (
                  <p className="text-sm text-slate-400">
                    <span className="text-slate-500">Houder:</span>{' '}
                    <span className="text-white">{holderName}</span>
                  </p>
                )}
                {holderEmail && (
                  <p className="text-sm text-slate-400">
                    <span className="text-slate-500">Email:</span>{' '}
                    <span className="text-white">{holderEmail}</span>
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResendModal(false)}
                disabled={actionLoading}
                className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold text-white transition-colors disabled:opacity-50"
              >
                Annuleren
              </button>
              <button
                onClick={handleResendEmail}
                disabled={actionLoading}
                className="flex-1 px-4 py-3 bg-cyan-500 hover:bg-cyan-400 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Versturen...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4" />
                    Versturen
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowDeleteModal(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Ticket Verwijderen</h3>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="p-2 hover:bg-slate-700 rounded-lg text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 mb-6">
              <p className="text-slate-300">
                Weet je zeker dat je dit ticket wilt verwijderen?
              </p>
              <p className="text-red-400 text-sm">
                Deze actie kan niet ongedaan worden gemaakt.
              </p>
              {wasScanned && (
                <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <p className="text-yellow-400 text-sm font-medium">
                    Let op: Dit ticket is al gescand!
                  </p>
                </div>
              )}
              <div className="bg-slate-900 rounded-lg p-4 space-y-2">
                <p className="text-sm text-slate-400">
                  <span className="text-slate-500">Ticket:</span>{' '}
                  <span className="text-cyan-400 font-mono">{ticketNumber}</span>
                </p>
                {holderName && (
                  <p className="text-sm text-slate-400">
                    <span className="text-slate-500">Houder:</span>{' '}
                    <span className="text-white">{holderName}</span>
                  </p>
                )}
                {status && (
                  <p className="text-sm text-slate-400">
                    <span className="text-slate-500">Status:</span>{' '}
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      status === 'valid'
                        ? 'bg-green-500/20 text-green-400'
                        : status === 'used'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-slate-600/20 text-slate-400'
                    }`}>
                      {status}
                    </span>
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={actionLoading}
                className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold text-white transition-colors disabled:opacity-50"
              >
                Annuleren
              </button>
              <button
                onClick={handleDeleteTicket}
                disabled={actionLoading}
                className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-400 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Verwijderen...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Verwijderen
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
