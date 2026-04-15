import { useState } from 'react';
import { Mail, Trash2, X, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
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
  const [deleteStep, setDeleteStep] = useState(1);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteReasonDetail, setDeleteReasonDetail] = useState('');
  const [deleteEventName, setDeleteEventName] = useState('');
  const [deleteEventNameConfirm, setDeleteEventNameConfirm] = useState('');

  const wasScanned = status === 'used' || scanStatus === 'scanned';

  async function handleResendEmail() {
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('resend-ticket-email', {
        body: { ticket_id: ticketId }
      });

      if (error) throw new Error(error.message || 'Edge function error');
      if (data && !data.success) throw new Error(data.error || 'Versturen mislukt');

      showToast(`Email verstuurd naar ${data?.recipient || holderEmail || 'ontvanger'}`, 'success');
      setShowResendModal(false);
      onActionComplete?.();
    } catch (error: any) {
      showToast(`Fout: ${error.message || 'Onbekende fout'}`, 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteTicket() {
    if (deleteStep === 1) {
      try {
        const { data: ticket } = await supabase
          .from('tickets')
          .select('order_id, orders(event_id, events(name))')
          .eq('id', ticketId)
          .maybeSingle();
        setDeleteEventName((ticket as any)?.orders?.events?.name || 'Event');
      } catch { setDeleteEventName('Event'); }
      setDeleteStep(2);
      return;
    }

    if (deleteStep === 2) {
      if (!deleteReason) {
        showToast('Selecteer een reden', 'error');
        return;
      }
      setDeleteEventNameConfirm('');
      setDeleteStep(3);
      return;
    }

    if (deleteStep === 3) {
      if (deleteEventNameConfirm.toLowerCase().trim() !== deleteEventName.toLowerCase().trim()) return;
    }

    setActionLoading(true);
    try {
      const finalReason = deleteReason === 'andere' ? deleteReasonDetail : deleteReason;

      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .select('*, orders(id, status, event_id, order_number, payer_name, payer_email, total_amount)')
        .eq('id', ticketId)
        .maybeSingle();

      if (ticketError) throw new Error(ticketError.message);
      if (!ticket) throw new Error('Ticket niet gevonden');

      const orderId = ticket.order_id;

      const { data: seatRows } = await supabase
        .from('ticket_seats')
        .select('seat_id')
        .eq('order_id', orderId)
        .limit(10000);
      const seatIds = (seatRows || []).map((r: any) => r.seat_id).filter(Boolean);
      if (seatIds.length > 0) {
        await supabase.from('seats').update({ status: 'available', held_by: null, held_until: null }).in('id', seatIds);
        await supabase.from('ticket_seats').delete().eq('order_id', orderId);
      }

      await supabase.from('guest_ticket_qrs').update({ is_active: false }).eq('order_id', orderId);

      await supabase.from('tickets').update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_reason: finalReason
      }).eq('id', ticketId);

      if (ticket.ticket_type_id) {
        const { data: tt } = await supabase.from('ticket_types').select('quantity_sold').eq('id', ticket.ticket_type_id).maybeSingle();
        if (tt) {
          await supabase.from('ticket_types').update({
            quantity_sold: Math.max(0, (tt.quantity_sold || 0) - 1)
          }).eq('id', ticket.ticket_type_id);
        }
      }

      await supabase.from('orders').update({
        status: 'refunded',
        refunded_at: new Date().toISOString(),
        refund_reason: finalReason,
        refund_notes: deleteReason === 'andere' ? deleteReasonDetail : null
      }).eq('id', orderId);

      try {
        await supabase.from('ticket_deletions').insert({
          order_id: orderId,
          event_id: (ticket as any).orders?.event_id,
          reason: finalReason,
          reason_detail: deleteReason === 'andere' ? deleteReasonDetail : null,
          ticket_count: 1,
          refund_amount: (ticket as any).orders?.total_amount || 0,
          original_order_number: (ticket as any).orders?.order_number,
          original_payer_name: (ticket as any).orders?.payer_name,
          original_payer_email: (ticket as any).orders?.payer_email,
          seats_released: seatIds.map(String)
        });
      } catch (logErr) {
        console.error('Log error (non-critical):', logErr);
      }

      showToast(`Ticket ${ticketNumber} verwijderd. ${seatIds.length} stoel(en) vrijgegeven.`, 'success');
      setShowDeleteModal(false);
      setDeleteStep(1);
      setDeleteReason('');
      setDeleteReasonDetail('');
      onActionComplete?.();
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
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => { setShowDeleteModal(false); setDeleteStep(1); setDeleteReason(''); setDeleteReasonDetail(''); }}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-white">Ticket Verwijderen</h3>
                <p className="text-red-400/70 text-xs mt-1">Stap {deleteStep} van 3</p>
              </div>
              <button onClick={() => { setShowDeleteModal(false); setDeleteStep(1); }} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="w-full bg-slate-700 rounded-full h-1 mb-6">
              <div className="h-full bg-red-500 rounded-full transition-all duration-300" style={{ width: `${(deleteStep / 3) * 100}%` }} />
            </div>

            {deleteStep === 1 && (
              <div className="space-y-4">
                <p className="text-slate-300">Weet je zeker dat je dit ticket wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.</p>
                {wasScanned && (
                  <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-3 flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <p className="text-yellow-400 text-sm font-medium">Let op: Dit ticket is al gescand!</p>
                  </div>
                )}
                <div className="bg-slate-900 rounded-lg p-4 space-y-2">
                  <p className="text-sm"><span className="text-slate-500">Ticket:</span> <span className="text-cyan-400 font-mono">{ticketNumber}</span></p>
                  {holderName && <p className="text-sm"><span className="text-slate-500">Houder:</span> <span className="text-white">{holderName}</span></p>}
                  {holderEmail && <p className="text-sm"><span className="text-slate-500">Email:</span> <span className="text-slate-300">{holderEmail}</span></p>}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => { setShowDeleteModal(false); setDeleteStep(1); }} className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold text-white transition-colors">Annuleren</button>
                  <button onClick={() => handleDeleteTicket()} className="flex-1 px-4 py-3 bg-amber-500 hover:bg-amber-400 rounded-lg font-semibold text-white transition-colors">Ja, ga verder</button>
                </div>
              </div>
            )}

            {deleteStep === 2 && (
              <div className="space-y-4">
                <p className="text-slate-300">Selecteer de reden voor verwijdering:</p>
                <select value={deleteReason} onChange={e => { setDeleteReason(e.target.value); setDeleteReasonDetail(''); }} className="w-full p-3 bg-slate-900 text-white border border-slate-600 rounded-lg">
                  <option value="">-- Selecteer een reden --</option>
                  <option value="dubbel_gekocht">Klant heeft per ongeluk dubbel gekocht</option>
                  <option value="terugbetaling">Terugbetaling wegens geldige reden</option>
                  <option value="fraude">Frauduleuze bestelling</option>
                  <option value="event_geannuleerd">Event geannuleerd</option>
                  <option value="andere">Andere reden</option>
                </select>
                {deleteReason === 'andere' && (
                  <textarea value={deleteReasonDetail} onChange={e => setDeleteReasonDetail(e.target.value)} placeholder="Specificeer de reden..." className="w-full p-3 bg-slate-900 text-white border border-slate-600 rounded-lg min-h-[60px]" />
                )}
                <div className="flex gap-3">
                  <button onClick={() => setDeleteStep(1)} className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold text-white transition-colors">Terug</button>
                  <button onClick={() => handleDeleteTicket()} disabled={!deleteReason || (deleteReason === 'andere' && !deleteReasonDetail)} className="flex-1 px-4 py-3 bg-blue-500 hover:bg-blue-400 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Volgende</button>
                </div>
              </div>
            )}

            {deleteStep === 3 && (
              <div className="space-y-4">
                <p className="text-slate-300">Typ de event naam om te bevestigen:</p>
                <p className="text-lg font-bold text-red-400">{deleteEventName}</p>
                <input value={deleteEventNameConfirm} onChange={e => setDeleteEventNameConfirm(e.target.value)} placeholder="Typ de event naam..." className="w-full p-3 bg-slate-900 text-white border border-slate-600 rounded-lg" />
                <div className="flex gap-3">
                  <button onClick={() => setDeleteStep(2)} className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold text-white transition-colors">Terug</button>
                  <button
                    onClick={() => handleDeleteTicket()}
                    disabled={actionLoading || deleteEventNameConfirm.toLowerCase().trim() !== deleteEventName.toLowerCase().trim()}
                    className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-400 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {actionLoading ? (
                      <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Verwijderen...</>
                    ) : (
                      <><Trash2 className="w-4 h-4" /> Definitief Verwijderen</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
