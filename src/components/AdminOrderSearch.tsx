import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, X, Mail, Phone, ShoppingCart, CheckCircle, XCircle, Clock,
  AlertTriangle, Send, Ban, Shield, ShieldCheck, Save, Loader2, Copy,
  ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { callEdgeFunction } from '../lib/callEdge';
import { useToast } from './Toast';

interface OrderRow {
  id: string;
  order_number: string;
  payer_name: string;
  payer_email: string;
  payer_phone: string | null;
  total_amount: number;
  service_fee_total_cents: number;
  status: string;
  payment_method: string | null;
  payment_id: string | null;
  verification_code: string | null;
  verified_at: string | null;
  verified_by: string | null;
  admin_notes: string | null;
  metadata: any;
  created_at: string;
  event_id: string;
  events?: { name: string } | null;
}

interface TicketSeatRow {
  id: string;
  seat_id: string;
  price_paid: number;
  ticket_code: string | null;
  qr_data: string | null;
  seats?: {
    row_label: string;
    seat_number: number;
    seat_type: string;
    section_id: string;
    seat_sections?: { name: string; color: string } | null;
  } | null;
  scans?: { scanned_at: string }[] | null;
}

interface Props {
  orders: OrderRow[];
  onOrdersChange: () => void;
}

export function AdminOrderSearch({ orders, onOrdersChange }: Props) {
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);
  const [ticketSeats, setTicketSeats] = useState<TicketSeatRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [verifyInput, setVerifyInput] = useState('');
  const [verifyResult, setVerifyResult] = useState<'idle' | 'success' | 'fail'>('idle');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showTickets, setShowTickets] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);

  const filteredOrders = searchQuery.trim().length < 2
    ? orders.slice(0, 50)
    : orders.filter(o => {
        const q = searchQuery.toLowerCase();
        return (
          o.order_number?.toLowerCase().includes(q) ||
          o.payer_email?.toLowerCase().includes(q) ||
          o.payer_name?.toLowerCase().includes(q) ||
          o.verification_code?.toLowerCase().includes(q)
        );
      }).slice(0, 50);

  const loadOrderDetail = useCallback(async (order: OrderRow) => {
    setSelectedOrder(order);
    setDetailLoading(true);
    setNotesValue(order.admin_notes || '');
    setVerifyInput('');
    setVerifyResult('idle');
    setShowCancelConfirm(false);
    setShowTickets(true);

    try {
      const { data, error } = await supabase
        .from('ticket_seats')
        .select(`
          id, seat_id, price_paid, ticket_code, qr_data,
          seats!inner(row_label, seat_number, seat_type, section_id,
            seat_sections(name, color)
          )
        `)
        .eq('order_id', order.id);

      if (error) throw error;

      const withScans = await Promise.all(
        (data || []).map(async (ts: any) => {
          const { data: scanData } = await supabase
            .from('scans')
            .select('scanned_at')
            .eq('ticket_id', ts.id)
            .limit(1);
          return { ...ts, scans: scanData || [] };
        })
      );

      setTicketSeats(withScans as TicketSeatRow[]);
    } catch {
      setTicketSeats([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleResendEmail = useCallback(async () => {
    if (!selectedOrder) return;
    setResendLoading(true);
    try {
      const result = await callEdgeFunction({
        functionName: 'send-ticket-email',
        body: { orderId: selectedOrder.id, resend: true, source: 'admin-resend' },
      });
      if (result.ok) {
        showToast('Bevestigingsmail opnieuw verstuurd', 'success');
      } else {
        showToast(result.error || 'Mail versturen mislukt', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Mail versturen mislukt', 'error');
    } finally {
      setResendLoading(false);
    }
  }, [selectedOrder, showToast]);

  const handleCancelOrder = useCallback(async () => {
    if (!selectedOrder) return;
    setCancelLoading(true);
    try {
      const result = await callEdgeFunction({
        functionName: 'cancel-order',
        body: { order_id: selectedOrder.id },
      });
      if (result.ok) {
        showToast(`Order ${selectedOrder.order_number} geannuleerd`, 'success');
        setSelectedOrder(null);
        onOrdersChange();
      } else {
        showToast(result.error || 'Annuleren mislukt', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Annuleren mislukt', 'error');
    } finally {
      setCancelLoading(false);
      setShowCancelConfirm(false);
    }
  }, [selectedOrder, showToast, onOrdersChange]);

  const handleSaveNotes = useCallback(async () => {
    if (!selectedOrder) return;
    setNotesSaving(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ admin_notes: notesValue || null })
        .eq('id', selectedOrder.id);
      if (error) throw error;
      setSelectedOrder(prev => prev ? { ...prev, admin_notes: notesValue || null } : null);
      showToast('Notitie opgeslagen', 'success');
      onOrdersChange();
    } catch {
      showToast('Opslaan mislukt', 'error');
    } finally {
      setNotesSaving(false);
    }
  }, [selectedOrder, notesValue, showToast, onOrdersChange]);

  const handleVerify = useCallback(async () => {
    if (!selectedOrder || !verifyInput.trim()) return;
    const match = verifyInput.trim().toLowerCase() === (selectedOrder.verification_code || '').toLowerCase();
    if (match) {
      setVerifyResult('success');
      const { data: { user } } = await supabase.auth.getUser();
      await supabase
        .from('orders')
        .update({
          verified_at: new Date().toISOString(),
          verified_by: user?.id || null,
        })
        .eq('id', selectedOrder.id);
      setSelectedOrder(prev => prev ? { ...prev, verified_at: new Date().toISOString(), verified_by: user?.id || null } : null);
      onOrdersChange();
    } else {
      setVerifyResult('fail');
    }
  }, [selectedOrder, verifyInput, onOrdersChange]);

  const handleCopyOrder = useCallback(async () => {
    if (!selectedOrder) return;
    try {
      await navigator.clipboard.writeText(selectedOrder.order_number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [selectedOrder]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedOrder) {
        setSelectedOrder(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedOrder]);

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      paid: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Betaald' },
      pending: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Pending' },
      failed: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Mislukt' },
      cancelled: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Geannuleerd' },
      refunded: { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'Teruggestort' },
      comped: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Comped' },
    };
    const s = map[status] || { bg: 'bg-slate-600/20', text: 'text-slate-400', label: status };
    return <span className={`px-2 py-1 rounded text-xs font-medium ${s.bg} ${s.text}`}>{s.label}</span>;
  };

  return (
    <div>
      <h2 className="text-3xl font-bold mb-2 text-white">
        Order<span className="text-red-400">overzicht</span>
      </h2>
      <p className="text-slate-400 mb-6">Zoek en beheer bestellingen</p>

      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          ref={searchRef}
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Zoek op bestelnummer, e-mail, naam of verificatiecode..."
          className="w-full pl-12 pr-10 py-3.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500/30 text-sm"
        />
        {searchQuery && (
          <button
            onClick={() => { setSearchQuery(''); searchRef.current?.focus(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex gap-6">
        <div className={`${selectedOrder ? 'w-1/2 hidden xl:block' : 'w-full'}`}>
          <div className="bg-slate-800/80 border border-slate-700 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-900 border-b border-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Order</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Klant</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 hidden lg:table-cell">Event</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300">Bedrag</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <ShoppingCart className="w-10 h-10 mx-auto mb-3 text-slate-600" />
                      <p className="text-slate-400 text-sm">Geen orders gevonden</p>
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map(order => (
                    <tr
                      key={order.id}
                      onClick={() => loadOrderDetail(order)}
                      className={`cursor-pointer transition-colors ${
                        selectedOrder?.id === order.id
                          ? 'bg-red-500/10 border-l-2 border-l-red-500'
                          : 'hover:bg-slate-700/30'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-cyan-400 text-xs">{order.order_number}</span>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {new Date(order.created_at).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-white text-sm truncate max-w-[140px]">{order.payer_name}</div>
                        <div className="text-xs text-slate-400 truncate max-w-[140px]">{order.payer_email}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-300 text-sm hidden lg:table-cell truncate max-w-[120px]">
                        {order.events?.name || '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-white font-semibold text-sm tabular-nums">
                        {'\u20AC'}{(order.total_amount / 100).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        {statusBadge(order.status)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {searchQuery.trim().length >= 2 && (
            <p className="text-xs text-slate-500 mt-2">{filteredOrders.length} resultaten</p>
          )}
        </div>

        {selectedOrder && (
          <OrderDetailPanel
            order={selectedOrder}
            ticketSeats={ticketSeats}
            loading={detailLoading}
            resendLoading={resendLoading}
            cancelLoading={cancelLoading}
            notesSaving={notesSaving}
            notesValue={notesValue}
            verifyInput={verifyInput}
            verifyResult={verifyResult}
            showCancelConfirm={showCancelConfirm}
            copied={copied}
            showTickets={showTickets}
            onClose={() => setSelectedOrder(null)}
            onResend={handleResendEmail}
            onCancel={handleCancelOrder}
            onSaveNotes={handleSaveNotes}
            onVerify={handleVerify}
            onCopy={handleCopyOrder}
            setNotesValue={setNotesValue}
            setVerifyInput={setVerifyInput}
            setShowCancelConfirm={setShowCancelConfirm}
            setShowTickets={setShowTickets}
            statusBadge={statusBadge}
          />
        )}
      </div>
    </div>
  );
}

function OrderDetailPanel({
  order,
  ticketSeats,
  loading,
  resendLoading,
  cancelLoading,
  notesSaving,
  notesValue,
  verifyInput,
  verifyResult,
  showCancelConfirm,
  copied,
  showTickets,
  onClose,
  onResend,
  onCancel,
  onSaveNotes,
  onVerify,
  onCopy,
  setNotesValue,
  setVerifyInput,
  setShowCancelConfirm,
  setShowTickets,
  statusBadge,
}: {
  order: OrderRow;
  ticketSeats: TicketSeatRow[];
  loading: boolean;
  resendLoading: boolean;
  cancelLoading: boolean;
  notesSaving: boolean;
  notesValue: string;
  verifyInput: string;
  verifyResult: 'idle' | 'success' | 'fail';
  showCancelConfirm: boolean;
  copied: boolean;
  showTickets: boolean;
  onClose: () => void;
  onResend: () => void;
  onCancel: () => void;
  onSaveNotes: () => void;
  onVerify: () => void;
  onCopy: () => void;
  setNotesValue: (v: string) => void;
  setVerifyInput: (v: string) => void;
  setShowCancelConfirm: (v: boolean) => void;
  setShowTickets: (v: boolean) => void;
  statusBadge: (s: string) => JSX.Element;
}) {
  const subtotalCents = ticketSeats.reduce((sum, ts) => sum + Number(ts.price_paid || 0), 0);
  const serviceFee = Number(order.service_fee_total_cents || 0) / 100;
  const totalEur = order.total_amount / 100;

  return (
    <div className={`${window.innerWidth < 1280 ? 'fixed inset-0 bg-black/70 z-50 flex items-start justify-end' : 'w-1/2'}`}>
      <div className={`bg-slate-800 border border-slate-700 rounded-xl overflow-hidden ${
        window.innerWidth < 1280 ? 'w-full max-w-lg h-full overflow-y-auto' : 'max-h-[calc(100vh-200px)] overflow-y-auto'
      }`}>
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 px-5 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <h3 className="text-white font-bold text-base">Order Detail</h3>
            {statusBadge(order.status)}
            {order.verified_at && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-green-500/20 rounded text-[10px] font-semibold text-green-400">
                <ShieldCheck className="w-3 h-3" /> Geverifieerd
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
          </div>
        ) : (
          <div className="p-5 space-y-5">
            <div className="bg-slate-900/60 rounded-lg p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 uppercase font-semibold">Bestelnummer</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-cyan-400 text-sm select-all">{order.order_number}</span>
                  <button onClick={onCopy} className="p-1 text-slate-500 hover:text-white">
                    {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 uppercase font-semibold">Datum</span>
                <span className="text-white text-sm">
                  {new Date(order.created_at).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {order.payment_method && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 uppercase font-semibold">Betaalmethode</span>
                  <span className="text-white text-sm capitalize">{order.payment_method}</span>
                </div>
              )}
              {order.payment_id && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 uppercase font-semibold">Mollie ID</span>
                  <a
                    href={`https://my.mollie.com/dashboard/payments/${order.payment_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-cyan-400 text-xs hover:underline"
                  >
                    {order.payment_id} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            <div className="bg-slate-900/60 rounded-lg p-4 space-y-2.5">
              <h4 className="text-xs text-slate-500 uppercase font-semibold mb-2">Klantgegevens</h4>
              <div className="flex items-center gap-2 text-white text-sm">
                <span className="font-medium">{order.payer_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                <a href={`mailto:${order.payer_email}`} className="text-cyan-400 text-sm hover:underline">
                  {order.payer_email}
                </a>
              </div>
              {order.payer_phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <a href={`tel:${order.payer_phone}`} className="text-slate-300 text-sm hover:underline">
                    {order.payer_phone}
                  </a>
                </div>
              )}
              {order.verification_code && (
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700">
                  <span className="text-xs text-slate-500 uppercase font-semibold">Verificatiecode</span>
                  <span className="font-mono text-lg font-bold text-amber-400 tracking-widest select-all">
                    {order.verification_code}
                  </span>
                </div>
              )}
            </div>

            {order.verification_code && !order.verified_at && (
              <div className="bg-slate-900/60 rounded-lg p-4">
                <h4 className="text-xs text-slate-500 uppercase font-semibold mb-3 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" /> Klant Verificatie
                </h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={verifyInput}
                    onChange={e => { setVerifyInput(e.target.value); }}
                    placeholder="Voer verificatiecode in..."
                    className={`flex-1 px-3 py-2 bg-slate-700 border rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none ${
                      verifyResult === 'fail' ? 'border-red-500' : verifyResult === 'success' ? 'border-green-500' : 'border-slate-600 focus:border-red-500'
                    }`}
                    onKeyDown={e => { if (e.key === 'Enter') onVerify(); }}
                  />
                  <button
                    onClick={onVerify}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Verifieer
                  </button>
                </div>
                {verifyResult === 'success' && (
                  <div className="flex items-center gap-2 mt-2 text-green-400 text-sm">
                    <CheckCircle className="w-4 h-4" /> Klant geverifieerd
                  </div>
                )}
                {verifyResult === 'fail' && (
                  <div className="flex items-center gap-2 mt-2 text-red-400 text-sm">
                    <AlertTriangle className="w-4 h-4" /> Verificatie mislukt — code komt niet overeen
                  </div>
                )}
              </div>
            )}

            {order.verified_at && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-green-500/10 border border-green-500/20 rounded-lg">
                <ShieldCheck className="w-4 h-4 text-green-400" />
                <span className="text-green-400 text-sm font-medium">Geverifieerd op {new Date(order.verified_at).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            )}

            <div className="bg-slate-900/60 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowTickets(!showTickets)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/50 transition-colors"
              >
                <h4 className="text-xs text-slate-500 uppercase font-semibold">Tickets ({ticketSeats.length})</h4>
                {showTickets ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
              </button>
              {showTickets && ticketSeats.length > 0 && (
                <div className="border-t border-slate-700">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-500 border-b border-slate-700/50">
                        <th className="px-3 py-2 text-left font-medium">Sectie</th>
                        <th className="px-2 py-2 text-left font-medium">Rij</th>
                        <th className="px-2 py-2 text-left font-medium">Stoel</th>
                        <th className="px-2 py-2 text-right font-medium">Prijs</th>
                        <th className="px-2 py-2 text-left font-medium">Code</th>
                        <th className="px-3 py-2 text-left font-medium">Gescand</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/30">
                      {ticketSeats.map(ts => {
                        const seat = ts.seats;
                        const section = seat?.seat_sections;
                        const scanned = ts.scans && ts.scans.length > 0;
                        return (
                          <tr key={ts.id} className="hover:bg-slate-800/30">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5">
                                <div
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: section?.color || '#64748b' }}
                                />
                                <span className="text-slate-300 truncate max-w-[80px]">{section?.name || '-'}</span>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-slate-300">{seat?.row_label || '-'}</td>
                            <td className="px-2 py-2 text-slate-300">{seat?.seat_number || '-'}</td>
                            <td className="px-2 py-2 text-right text-white font-medium tabular-nums">
                              {'\u20AC'}{(Number(ts.price_paid) / 100).toFixed(2)}
                            </td>
                            <td className="px-2 py-2">
                              {ts.ticket_code && (
                                <span className="font-mono text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded select-all">
                                  {ts.ticket_code}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {scanned ? (
                                <span className="text-green-400 flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3" />
                                  {new Date(ts.scans![0].scanned_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              ) : (
                                <span className="text-slate-500">Nee</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-slate-900/60 rounded-lg p-4 space-y-1.5">
              <h4 className="text-xs text-slate-500 uppercase font-semibold mb-2">Financieel</h4>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Subtotaal</span>
                <span className="text-slate-300 tabular-nums">{'\u20AC'}{(subtotalCents / 100).toFixed(2)}</span>
              </div>
              {serviceFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Servicekosten</span>
                  <span className="text-slate-300 tabular-nums">{'\u20AC'}{serviceFee.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold pt-1.5 border-t border-slate-700">
                <span className="text-white">Totaal</span>
                <span className="text-white tabular-nums">{'\u20AC'}{totalEur.toFixed(2)}</span>
              </div>
            </div>

            <div className="bg-slate-900/60 rounded-lg p-4">
              <h4 className="text-xs text-slate-500 uppercase font-semibold mb-2">Admin Notities</h4>
              <textarea
                value={notesValue}
                onChange={e => setNotesValue(e.target.value)}
                placeholder="Interne notities over deze order..."
                rows={3}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:border-red-500 focus:outline-none resize-none"
              />
              <button
                onClick={onSaveNotes}
                disabled={notesSaving}
                className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {notesSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Opslaan
              </button>
            </div>

            <div className="space-y-2">
              {order.status === 'paid' && (
                <button
                  onClick={onResend}
                  disabled={resendLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-medium rounded-xl transition-colors text-sm"
                >
                  {resendLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Mail Opnieuw Versturen
                </button>
              )}

              {(order.status === 'paid' || order.status === 'pending') && !showCancelConfirm && (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-red-500/50 text-red-400 hover:bg-red-500/10 font-medium rounded-xl transition-colors text-sm"
                >
                  <Ban className="w-4 h-4" />
                  Tickets Annuleren
                </button>
              )}

              {showCancelConfirm && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-red-400 text-sm font-medium">Weet je het zeker?</p>
                      <p className="text-red-400/70 text-xs mt-1">Alle tickets worden geannuleerd en stoelen worden vrijgegeven. De betaling moet apart via Mollie worden teruggestort.</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowCancelConfirm(false)}
                      className="flex-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Terug
                    </button>
                    <button
                      onClick={onCancel}
                      disabled={cancelLoading}
                      className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {cancelLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                      Bevestig Annulering
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
