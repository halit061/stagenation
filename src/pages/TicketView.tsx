import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabaseClient';

interface TicketViewProps {
  token: string;
}

export function TicketView({ token }: TicketViewProps) {
  const [ticket, setTicket] = useState<any>(null);
  const [event, setEvent] = useState<any>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTicket() {
      if (!token) {
        setError('Ongeldige link');
        setLoading(false);
        return;
      }

      try {
        const { data: ticketData, error: ticketError } = await supabase
          .from('public_ticket_view')
          .select('*')
          .eq('public_token', token)
          .maybeSingle();

        if (ticketError || !ticketData) {
          setError('Ticket ongeldig of verlopen');
          setLoading(false);
          return;
        }

        const mapped = {
          ...ticketData,
          ticket_types: {
            name: ticketData.ticket_type_name,
            theme: ticketData.ticket_type_theme,
          },
          events: {
            name: ticketData.event_name,
            start_date: ticketData.event_start_date,
            end_date: ticketData.event_end_date,
            location: ticketData.event_location,
            venue_name: ticketData.event_venue_name,
          },
          seat: ticketData.seat_section_name ? {
            section_name: ticketData.seat_section_name,
            row_label: ticketData.seat_row_label,
            seat_number: ticketData.seat_number,
          } : null,
        };

        setTicket(mapped);
        setEvent(mapped.events);

        const qrData = ticketData.qr_data || ticketData.id;
        const dataUrl = await QRCode.toDataURL(qrData, { width: 300, margin: 2 });
        setQrUrl(dataUrl);
      } catch (err) {
        setError('Er ging iets mis');
      } finally {
        setLoading(false);
      }
    }

    loadTicket();
  }, [token]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' }}>
        <p style={{ color: '#94a3b8', fontSize: '18px' }}>Ticket laden...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' }}>
        <div style={{ textAlign: 'center', padding: '40px', backgroundColor: '#1e293b', borderRadius: '16px', maxWidth: '400px' }}>
          <p style={{ color: '#f87171', fontSize: '18px', margin: 0 }}>{error}</p>
        </div>
      </div>
    );
  }

  const theme = ticket?.ticket_types?.theme;
  const headerBg = theme?.header_bg || 'linear-gradient(135deg, #0e7490 0%, #0369a1 100%)';
  const headerText = theme?.header_text || '#ffffff';
  const cardBorder = theme?.card_border || '#e2e8f0';
  const badgeText = theme?.badge_text || '';
  const badgeBg = theme?.badge_bg || '#D4AF37';
  const badgeTextColor = theme?.badge_text_color || '#1a1a1a';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', padding: '20px' }}>
      <div style={{ maxWidth: '400px', margin: '0 auto', backgroundColor: '#ffffff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.3)', border: cardBorder !== '#e2e8f0' ? `2px solid ${cardBorder}` : undefined }}>
        <div style={{ background: headerBg, padding: '24px', textAlign: 'center' }}>
          <h1 style={{ color: headerText, margin: 0, fontSize: '20px', fontWeight: 700 }}>
            {event?.name || 'Event'}
          </h1>
          <p style={{ color: headerText, opacity: 0.85, margin: '8px 0 0 0', fontSize: '14px' }}>
            {ticket?.ticket_types?.name || 'Ticket'}
          </p>
        </div>

        <div style={{ padding: '24px', textAlign: 'center' }}>
          {badgeText && (
            <div style={{ marginBottom: '16px' }}>
              <span style={{ display: 'inline-block', background: badgeBg, color: badgeTextColor, fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', padding: '4px 14px', borderRadius: '20px', textTransform: 'uppercase' }}>
                {badgeText}
              </span>
            </div>
          )}

          {qrUrl && (
            <img
              src={qrUrl}
              alt="QR Code"
              style={{ width: '220px', height: '220px', border: '1px solid #cbd5e1', borderRadius: '8px' }}
            />
          )}

          {ticket?.seat && (
            <div style={{ backgroundColor: '#eff6ff', border: '2px solid #3b82f6', borderRadius: '8px', padding: '16px', margin: '20px 0' }}>
              <p style={{ color: '#3b82f6', fontSize: '11px', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>
                Toegewezen Plaats
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '24px' }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: '#64748b', fontSize: '10px', margin: '0 0 2px 0', textTransform: 'uppercase' }}>Sectie</p>
                  <p style={{ color: '#0f172a', fontSize: '16px', fontWeight: 700, margin: 0 }}>{ticket.seat.section_name}</p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: '#64748b', fontSize: '10px', margin: '0 0 2px 0', textTransform: 'uppercase' }}>Rij</p>
                  <p style={{ color: '#0f172a', fontSize: '16px', fontWeight: 700, margin: 0 }}>{ticket.seat.row_label}</p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: '#64748b', fontSize: '10px', margin: '0 0 2px 0', textTransform: 'uppercase' }}>Stoel</p>
                  <p style={{ color: '#0f172a', fontSize: '16px', fontWeight: 700, margin: 0 }}>{ticket.seat.seat_number}</p>
                </div>
              </div>
            </div>
          )}

          <div style={{ backgroundColor: '#f1f5f9', borderRadius: '8px', padding: '16px', margin: '20px 0' }}>
            <p style={{ color: '#64748b', fontSize: '12px', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Ticket Nummer
            </p>
            <p style={{ color: '#0f172a', fontSize: '18px', fontWeight: 700, margin: 0, fontFamily: 'Courier New, monospace', letterSpacing: '1px' }}>
              {ticket?.ticket_number}
            </p>
          </div>

          <p style={{ color: '#64748b', fontSize: '14px', margin: '12px 0' }}>
            <strong style={{ color: '#0f172a' }}>Naam:</strong> {ticket?.holder_name}<br />
            <strong style={{ color: '#0f172a' }}>Email:</strong> {ticket?.holder_email}
          </p>

          <div style={{ backgroundColor: '#fef3c7', border: '2px solid #f59e0b', borderRadius: '8px', padding: '12px', marginTop: '20px' }}>
            <p style={{ color: '#92400e', margin: 0, fontSize: '13px', lineHeight: 1.5 }}>
              <strong>Belangrijk:</strong> Toon deze QR-code aan de ingang. Dit ticket kan slechts een keer worden gescand.
            </p>
          </div>
        </div>

        <div style={{ backgroundColor: '#f8fafc', padding: '16px', textAlign: 'center', borderTop: '1px solid #e2e8f0' }}>
          <p style={{ color: '#64748b', margin: 0, fontSize: '12px' }}>
            StageNation
          </p>
        </div>
      </div>
    </div>
  );
}
