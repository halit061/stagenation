import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Ticket, MapPin, Calendar, Clock, User, Armchair } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface VerifyData {
  status: 'valid' | 'used' | 'invalid' | 'revoked';
  ticket_number: string;
  event_name: string;
  event_date: string;
  event_location: string | null;
  venue_name: string | null;
  section_name: string;
  section_color: string;
  row_label: string;
  seat_number: number;
  payer_name: string;
  scanned_at: string | null;
}

async function lookupTicketByToken(token: string): Promise<VerifyData | null> {
  const { data: ts, error } = await supabase
    .from('ticket_seats')
    .select('id, ticket_number, seat_id, order_id, event_id, assigned_at')
    .eq('qr_token', token)
    .maybeSingle();

  if (error || !ts) return null;

  const [seatRes, orderRes, eventRes] = await Promise.all([
    supabase.from('seats').select('row_label, seat_number, section_id').eq('id', ts.seat_id).maybeSingle(),
    supabase.from('orders').select('payer_name, status').eq('id', ts.order_id).maybeSingle(),
    supabase.from('events').select('name, start_date, location, venue_name').eq('id', ts.event_id).maybeSingle(),
  ]);

  const seat = seatRes.data;
  const order = orderRes.data;
  const event = eventRes.data;

  if (!seat || !order || !event) return null;

  let sectionName = '';
  let sectionColor = '#64748b';
  if (seat.section_id) {
    const { data: sec } = await supabase
      .from('seat_sections')
      .select('name, color')
      .eq('id', seat.section_id)
      .maybeSingle();
    if (sec) {
      sectionName = sec.name || '';
      sectionColor = sec.color || '#64748b';
    }
  }

  const { data: scans } = await supabase
    .from('scans')
    .select('scanned_at')
    .eq('ticket_id', ts.id)
    .eq('result', 'valid')
    .order('scanned_at', { ascending: false })
    .limit(1);

  const scannedAt = scans && scans.length > 0 ? scans[0].scanned_at : null;

  let status: VerifyData['status'] = 'valid';
  if (order.status === 'cancelled' || order.status === 'refunded') {
    status = 'revoked';
  } else if (scannedAt) {
    status = 'used';
  } else if (order.status !== 'paid') {
    status = 'invalid';
  }

  return {
    status,
    ticket_number: ts.ticket_number || '',
    event_name: event.name,
    event_date: event.start_date,
    event_location: event.location,
    venue_name: event.venue_name ?? null,
    section_name: sectionName,
    section_color: sectionColor,
    row_label: seat.row_label,
    seat_number: seat.seat_number,
    payer_name: order.payer_name,
    scanned_at: scannedAt,
  };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

function formatScannedAt(dateStr: string): string {
  return new Date(dateStr).toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface Props {
  token: string;
}

export function TicketVerify({ token }: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<VerifyData | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    lookupTicketByToken(token)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-transparent border-t-blue-500 rounded-full animate-spin" />
          </div>
          <p className="text-slate-400 text-sm">Ticket verifiëren...</p>
        </div>
      </div>
    );
  }

  if (!token || !data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Ongeldig Ticket</h1>
            <p className="text-slate-400 text-sm">
              Dit ticket kon niet worden gevonden. De link is ongeldig of verlopen.
            </p>
          </div>
          <p className="text-center text-slate-600 text-xs mt-6">StageNation Ticketing</p>
        </div>
      </div>
    );
  }

  const statusConfig = {
    valid: {
      icon: CheckCircle,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/30',
      label: 'Geldig Ticket',
      description: 'Dit ticket is geldig en kan worden gescand bij de ingang.',
    },
    used: {
      icon: AlertTriangle,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/30',
      label: 'Reeds Gescand',
      description: data.scanned_at
        ? `Dit ticket is al gescand op ${formatScannedAt(data.scanned_at)}.`
        : 'Dit ticket is al eerder gescand.',
    },
    invalid: {
      icon: XCircle,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/30',
      label: 'Ongeldig Ticket',
      description: 'Dit ticket is niet geldig. De betaling is niet voltooid.',
    },
    revoked: {
      icon: XCircle,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/30',
      label: 'Geannuleerd',
      description: 'Dit ticket is geannuleerd of terugbetaald.',
    },
  };

  const cfg = statusConfig[data.status];
  const StatusIcon = cfg.icon;
  const venue = [data.venue_name, data.event_location].filter(Boolean).join(' - ');

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className={`${cfg.bgColor} border-b ${cfg.borderColor} px-6 py-6 text-center`}>
            <div className={`w-16 h-16 rounded-full ${cfg.bgColor} flex items-center justify-center mx-auto mb-3`}>
              <StatusIcon className={`w-8 h-8 ${cfg.color}`} />
            </div>
            <h1 className={`text-xl font-bold ${cfg.color} mb-1`}>{cfg.label}</h1>
            <p className="text-slate-400 text-sm">{cfg.description}</p>
          </div>

          <div className="p-6 space-y-5">
            <div className="flex items-start gap-3">
              <Ticket className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-0.5">Ticketnummer</p>
                <p className="text-white font-mono font-bold text-sm">{data.ticket_number}</p>
              </div>
            </div>

            <div className="h-px bg-slate-800" />

            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-0.5">Evenement</p>
                <p className="text-white font-semibold text-sm">{data.event_name}</p>
                <p className="text-slate-400 text-xs mt-0.5">
                  {formatDate(data.event_date)}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-0.5">Aanvang</p>
                <p className="text-white text-sm">{formatTime(data.event_date)}</p>
              </div>
            </div>

            {venue && (
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-0.5">Locatie</p>
                  <p className="text-white text-sm">{venue}</p>
                </div>
              </div>
            )}

            <div className="h-px bg-slate-800" />

            <div className="flex items-start gap-3">
              <Armchair className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-0.5">Zitplaats</p>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: data.section_color }}
                  />
                  <span className="text-white font-semibold text-sm">{data.section_name}</span>
                </div>
                <p className="text-slate-400 text-sm mt-1">
                  Rij {data.row_label} &middot; Stoel {data.seat_number}
                </p>
              </div>
            </div>

            <div className="h-px bg-slate-800" />

            <div className="flex items-start gap-3">
              <User className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-0.5">Op naam van</p>
                <p className="text-white text-sm">{data.payer_name}</p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">StageNation Ticketing</p>
      </div>
    </div>
  );
}

export default TicketVerify;
