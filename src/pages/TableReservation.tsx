import { useState, useEffect } from 'react';
import { Mail, Phone, User, MessageSquare, AlertCircle, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import type { Database } from '../lib/supabaseClient';
import { useLanguage } from '../contexts/LanguageContext';
import { FloorPlan } from '../components/FloorPlan';
import { localeMap, txt } from '../lib/translations';

type Event = Database['public']['Tables']['events']['Row'];
type FloorplanTable = Database['public']['Tables']['floorplan_tables']['Row'];
type TablePackage = Database['public']['Tables']['table_packages']['Row'];

interface TableReservationProps {
  onNavigate: (page: string) => void;
}

export function TableReservation({ onNavigate: _onNavigate }: TableReservationProps) {
  const { language } = useLanguage();
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [selectedTable, setSelectedTable] = useState<FloorplanTable | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<TablePackage | null>(null);
  const [step, setStep] = useState<'event' | 'table' | 'form'>('event');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    guests: 2,
    specialRequests: '',
    marketingOptIn: false,
    acceptTerms: false,
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [, _setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [, _setReservationCode] = useState('');
  const [packageError, setPackageError] = useState<string>('');

  const isTemporarilyOffline = () => {
    const now = new Date();
    const offlineUntil = new Date('2026-02-16T00:00:00+01:00');
    return now < offlineUntil;
  };

  useEffect(() => {
    if (!isTemporarilyOffline()) {
      loadEvents();
    } else {
      setLoading(false);
    }
  }, []);

  async function loadEvents() {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('is_active', true)
        .gte('start_date', new Date().toISOString())
        .order('start_date', { ascending: true });

      if (error) {
        console.error('Safari-safe Supabase query failed', error);
        throw error;
      }
      setEvents(data || []);
    } catch (err) {
      console.error('Error loading events:', err);
      setError('Failed to load events');
    } finally {
      setLoading(false);
    }
  }

  const generateBookingCode = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const code = Array.from(bytes)
      .map(b => b.toString(36).padStart(2, '0'))
      .join('')
      .toUpperCase()
      .substring(0, 8);
    return 'FP' + code;
  };

  const handleTableSelect = async (table: FloorplanTable) => {
    setSelectedTable(table);
    setPackageError('');

    // Use included data directly from table record
    const tableData = table as any;
    if (tableData.included_items || tableData.included_text) {
      const pkg = {
        name: tableData.table_number,
        description: tableData.included_text,
        included_people: tableData.max_guests,
        included_items: tableData.included_items
      };
      setSelectedPackage(pkg as any);
    } else {
      setSelectedPackage(null);
    }

    setStep('form');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      if (!selectedTable || !selectedEvent) throw new Error('Invalid selection');

      if (!formData.acceptTerms) {
        throw new Error(txt(language, {
          nl: 'Je moet akkoord gaan met de algemene voorwaarden om door te gaan',
          tr: 'Devam etmek için genel şartları kabul etmelisiniz',
          fr: 'Vous devez accepter les conditions générales pour continuer',
          de: 'Sie müssen die AGB akzeptieren, um fortzufahren',
        }));
      }

      // SECURITY: Use atomic server-side reservation to prevent race conditions
      // and ensure price comes from the database, not client
      const code = generateBookingCode();
      const { data: bookingId, error: reserveError } = await supabase.rpc('atomic_reserve_table', {
        p_event_id: selectedEvent,
        p_floorplan_table_id: selectedTable.id,
        p_customer_name: formData.name,
        p_customer_email: formData.email,
        p_customer_phone: formData.phone,
        p_number_of_guests: formData.guests,
        p_special_requests: formData.specialRequests,
        p_booking_code: code,
      });

      if (reserveError) {
        if (reserveError.message?.includes('TABLE_ALREADY_BOOKED')) {
          throw new Error(txt(language, {
            nl: 'Deze tafel is al gereserveerd',
            tr: 'Bu masa zaten rezerve edildi',
            fr: 'Cette table est déjà réservée',
            de: 'Dieser Tisch ist bereits reserviert',
          }));
        }
        throw reserveError;
      }
      if (!bookingId) throw new Error('Failed to create booking');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-table-order`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            table_ids: [bookingId],
            customer_name: formData.name,
            customer_email: formData.email,
            customer_phone: formData.phone,
            event_id: selectedEvent,
            number_of_guests: formData.guests,
            special_requests: formData.specialRequests,
            marketing_opt_in: formData.marketingOptIn,
            terms_accepted: formData.acceptTerms,
            terms_language: language,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create order');
      }

      const data = await response.json();
      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      console.error('Error creating booking:', err);
      setError(
        err.message ||
        txt(language, {
          nl: 'Er is een fout opgetreden bij het maken van de reservering',
          tr: 'Rezervasyon oluşturulurken bir hata oluştu',
          fr: 'Une erreur est survenue lors de la création de la réservation',
          de: 'Bei der Erstellung der Reservierung ist ein Fehler aufgetreten',
        })
      );
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(language ? localeMap[language] : 'nl-BE', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'Europe/Brussels',
      year: 'numeric',
    });
  };

  if (isTemporarilyOffline()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black px-4">
        <div className="text-center max-w-2xl">
          <MessageSquare className="w-20 h-20 text-slate-600 mx-auto mb-6" />
          <h2 className="text-3xl font-bold mb-4 text-white">
            {txt(language, {
              nl: 'Tijdelijk Offline',
              tr: 'Geçici Olarak Çevrimdışı',
              fr: 'Temporairement Hors Ligne',
              de: 'Vorübergehend Offline',
            })}
          </h2>
          <p className="text-slate-400 text-lg">
            {txt(language, {
              nl: 'Tafelreservaties zijn tijdelijk niet beschikbaar. Kijk binnenkort terug voor de nieuwste updates!',
              tr: 'Masa rezervasyonları geçici olarak kullanılamıyor. En son güncellemeler için yakında tekrar bakın!',
              fr: 'Les réservations de table sont temporairement indisponibles. Revenez bientôt pour les dernières mises à jour !',
              de: 'Tischreservierungen sind vorübergehend nicht verfügbar. Schauen Sie bald wieder vorbei für die neuesten Updates!',
            })}
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">{txt(language, {
            nl: 'Laden...',
            tr: 'Yükleniyor...',
            fr: 'Chargement...',
            de: 'Wird geladen...',
          })}</p>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-black py-20 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-6xl font-black text-white mb-6">
            {txt(language, {
              nl: 'Table Reservations',
              tr: 'Masa Rezervasyonu',
              fr: 'Réservation de Table',
              de: 'Tischreservierung',
            })}
          </h1>
          <p className="text-xl text-slate-300 max-w-3xl mx-auto">
            {txt(language, {
              nl: 'Selecteer je tafel op het interactieve zaalplan en reserveer direct online.',
              tr: 'Etkileşimli salon planında masanızı seçin ve doğrudan çevrimiçi rezervasyon yapın.',
              fr: 'Sélectionnez votre table sur le plan interactif et réservez directement en ligne.',
              de: 'Wählen Sie Ihren Tisch auf dem interaktiven Saalplan und reservieren Sie direkt online.',
            })}
          </p>
        </div>

        {step === 'event' && (
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-white mb-6">
              {txt(language, {
                nl: 'Selecteer een Event',
                tr: 'Bir Etkinlik Seçin',
                fr: 'Sélectionnez un Événement',
                de: 'Wählen Sie ein Event',
              })}
            </h2>
            <div className="space-y-4">
              {events.filter((e) => (e as any).floorplan_enabled).length === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 text-lg">
                    {txt(language, {
                      nl: 'Er zijn momenteel geen events met tafelreserveringen beschikbaar.',
                      tr: 'Şu anda masa rezervasyonu yapılabilecek etkinlik bulunmamaktadır.',
                      fr: 'Il n\'y a actuellement aucun événement avec des réservations de table disponible.',
                      de: 'Es sind derzeit keine Events mit Tischreservierungen verfügbar.',
                    })}
                  </p>
                </div>
              ) : (
                events.filter((e) => (e as any).floorplan_enabled).map((event) => (
                  <button
                    key={event.id}
                    onClick={() => {
                      setSelectedEvent(event.id);
                      setStep('table');
                    }}
                    className="w-full bg-slate-900 hover:bg-slate-800 border border-amber-500/20 hover:border-amber-500 rounded-xl p-6 text-left transition-all group"
                  >
                    <h3 className="text-2xl font-bold text-white mb-2 group-hover:text-amber-400 transition-colors">
                      {event.name}
                    </h3>
                    <p className="text-slate-400">{formatDate(event.start_date)}</p>
                    <p className="text-slate-500 text-sm mt-2">{event.location}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {step === 'table' && selectedEvent && (
          <div>
            <button
              onClick={() => {
                setStep('event');
                setSelectedTable(null);
              }}
              className="mb-6 flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              {txt(language, {
                nl: 'Terug naar events',
                tr: 'Etkinliklere geri dön',
                fr: 'Retour aux événements',
                de: 'Zurück zu den Events',
              })}
            </button>
            <h2 className="text-2xl font-bold text-white mb-6">
              {txt(language, {
                nl: 'Selecteer je Tafel',
                tr: 'Masanızı Seçin',
                fr: 'Sélectionnez votre Table',
                de: 'Wählen Sie Ihren Tisch',
              })}
            </h2>
            <FloorPlan eventId={selectedEvent} onTableSelect={handleTableSelect} />
          </div>
        )}

        {step === 'form' && selectedTable && (
          <div className="max-w-2xl mx-auto">
            <button
              onClick={() => {
                setStep('table');
                setSelectedTable(null);
              }}
              className="mb-6 flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              {txt(language, {
                nl: 'Terug naar zaalplan',
                tr: 'Salon planına geri dön',
                fr: 'Retour au plan de salle',
                de: 'Zurück zum Saalplan',
              })}
            </button>

            {error && (
              <div className="mb-8 bg-red-500/10 border border-red-500 rounded-lg p-4 flex items-center space-x-3">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <p className="text-red-500">{error}</p>
              </div>
            )}

            <div className="bg-slate-900 rounded-xl p-8 border border-amber-500/20 mb-8">
              <h3 className="text-xl font-bold text-white mb-4">
                {txt(language, {
                  nl: 'Geselecteerde Tafel',
                  tr: 'Seçilen Masa',
                  fr: 'Table Sélectionnée',
                  de: 'Ausgewählter Tisch',
                })}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-slate-400 text-sm">{txt(language, {
                    nl: 'Tafel',
                    tr: 'Masa',
                    fr: 'Table',
                    de: 'Tisch',
                  })}</p>
                  <p className="text-white font-semibold text-lg">{selectedTable.table_number}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">{txt(language, {
                    nl: 'Capaciteit',
                    tr: 'Kapasite',
                    fr: 'Capacité',
                    de: 'Kapazität',
                  })}</p>
                  <p className="text-white font-semibold text-lg">{selectedTable.capacity} p</p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">{txt(language, {
                    nl: 'Type',
                    tr: 'Tip',
                    fr: 'Type',
                    de: 'Typ',
                  })}</p>
                  <p className="text-white font-semibold text-lg">
                    {selectedTable.table_type === 'SEATED'
                      ? txt(language, {
                          nl: 'Zittafel',
                          tr: 'Oturma',
                          fr: 'Assise',
                          de: 'Sitzplatz',
                        })
                      : txt(language, {
                          nl: 'Sta-tafel',
                          tr: 'Ayakta',
                          fr: 'Debout',
                          de: 'Stehtisch',
                        })}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">{txt(language, {
                    nl: 'Prijs',
                    tr: 'Fiyat',
                    fr: 'Prix',
                    de: 'Preis',
                  })}</p>
                  <p className="text-white font-semibold text-lg">€{selectedTable.price}</p>
                </div>
              </div>

              {packageError && (
                <div className="mt-6 pt-6 border-t border-slate-700">
                  <div className="bg-red-500/10 border border-red-500 rounded-lg p-4 text-red-500 text-sm">
                    {packageError}
                  </div>
                </div>
              )}

              {selectedPackage && (() => {
                let includedList: string[] = [];

                if (selectedPackage.included_items) {
                  if (Array.isArray(selectedPackage.included_items)) {
                    includedList = selectedPackage.included_items.map((item: any) => {
                      if (typeof item === 'string') {
                        return item.trim();
                      } else if (item.qty && item.label) {
                        return `${item.qty} ${item.label}`;
                      } else if (item.label) {
                        return item.label;
                      }
                      return String(item);
                    }).filter(Boolean);
                  } else if (typeof selectedPackage.included_items === 'string') {
                    includedList = selectedPackage.included_items
                      .split(/\s*[-,]\s*/)
                      .map((s: string) => s.trim())
                      .filter(Boolean);
                  }
                }

                const showIncludedSection = selectedPackage.description || selectedPackage.included_people || includedList.length > 0;

                return showIncludedSection ? (
                  <div className="mt-6 pt-6 border-t border-slate-700">
                    <h4 className="text-lg font-bold text-white mb-3">
                      {txt(language, {
                        nl: 'Inbegrepen in deze tafel',
                        tr: 'Bu masaya dahil',
                        fr: 'Inclus avec cette table',
                        de: 'Bei diesem Tisch inbegriffen',
                      })}
                    </h4>
                    {selectedPackage.description && (
                      <p className="text-slate-300 mb-3">{selectedPackage.description}</p>
                    )}
                    {selectedPackage.included_people && (
                      <div className="flex items-center gap-2 text-cyan-400 mb-2">
                        <User className="w-4 h-4" />
                        <span>{selectedPackage.included_people} {txt(language, {
                          nl: 'personen',
                          tr: 'kişi',
                          fr: 'personnes',
                          de: 'Personen',
                        })}</span>
                      </div>
                    )}
                    {includedList.length > 0 && (
                      <div className="mt-3">
                        <p className="text-slate-300">
                          {includedList.join(' - ')}
                        </p>
                      </div>
                    )}
                  </div>
                ) : null;
              })()}
            </div>

            <div className="bg-slate-900 rounded-xl p-8 border border-amber-500/20">
              <h2 className="text-2xl font-bold text-white mb-6">
                {txt(language, {
                  nl: 'Je Gegevens',
                  tr: 'Bilgileriniz',
                  fr: 'Vos Informations',
                  de: 'Ihre Angaben',
                })}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      {txt(language, {
                        nl: 'Naam',
                        tr: 'İsim',
                        fr: 'Nom',
                        de: 'Name',
                      })}
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                        placeholder={txt(language, {
                          nl: 'Je naam',
                          tr: 'Adınız',
                          fr: 'Votre nom',
                          de: 'Ihr Name',
                        })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      {txt(language, {
                        nl: 'Email',
                        tr: 'E-posta',
                        fr: 'E-mail',
                        de: 'E-Mail',
                      })}
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                        className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                        placeholder={txt(language, {
                          nl: 'je@email.com',
                          tr: 'email@ornek.com',
                          fr: 'votre@email.com',
                          de: 'ihre@email.com',
                        })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      {txt(language, {
                        nl: 'Telefoon',
                        tr: 'Telefon',
                        fr: 'Téléphone',
                        de: 'Telefon',
                      })}
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        required
                        className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                        placeholder="+32 XXX XX XX XX"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      {txt(language, {
                        nl: 'Aantal Gasten',
                        tr: 'Misafir Sayısı',
                        fr: 'Nombre d\'Invités',
                        de: 'Anzahl Gäste',
                      })}
                      <span className="text-slate-500 ml-2 font-normal">
                        ({txt(language, {
                          nl: 'Max',
                          tr: 'Maks',
                          fr: 'Max',
                          de: 'Max',
                        })} {(selectedTable as any).max_guests || selectedTable.capacity})
                      </span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={(selectedTable as any).max_guests || selectedTable.capacity}
                      value={formData.guests}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        const maxGuests = (selectedTable as any).max_guests || selectedTable.capacity;
                        const clampedValue = Math.max(1, Math.min(maxGuests, value || 1));
                        setFormData({ ...formData, guests: clampedValue });
                      }}
                      required
                      className={`w-full px-4 py-3 bg-slate-800 border rounded-lg text-white focus:outline-none ${
                        formData.guests > ((selectedTable as any).max_guests || selectedTable.capacity)
                          ? 'border-red-500 focus:border-red-500'
                          : 'border-slate-700 focus:border-amber-500'
                      }`}
                    />
                    {formData.guests > ((selectedTable as any).max_guests || selectedTable.capacity) && (
                      <p className="text-red-400 text-xs mt-1">
                        {txt(language, {
                          nl: `Maximum ${(selectedTable as any).max_guests || selectedTable.capacity} personen voor deze tafel`,
                          tr: `Bu masa için maksimum ${(selectedTable as any).max_guests || selectedTable.capacity} kişi`,
                          fr: `Maximum ${(selectedTable as any).max_guests || selectedTable.capacity} personnes pour cette table`,
                          de: `Maximal ${(selectedTable as any).max_guests || selectedTable.capacity} Personen für diesen Tisch`,
                        })}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    {txt(language, {
                      nl: 'Speciale Verzoeken (Optioneel)',
                      tr: 'Özel İstekler (İsteğe bağlı)',
                      fr: 'Demandes Spéciales (Facultatif)',
                      de: 'Besondere Wünsche (Optional)',
                    })}
                  </label>
                  <div className="relative">
                    <MessageSquare className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                    <textarea
                      value={formData.specialRequests}
                      onChange={(e) => setFormData({ ...formData, specialRequests: e.target.value })}
                      rows={4}
                      className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-amber-500 focus:outline-none resize-none"
                      placeholder={txt(language, {
                        nl: 'Bijv. verjaardagsviering...',
                        tr: 'Örn. doğum günü kutlaması...',
                        fr: 'Ex. anniversaire...',
                        de: 'Z.B. Geburtstagsfeier...',
                      })}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className={`bg-slate-800/50 border rounded-xl p-4 transition-colors ${
                    error && !formData.acceptTerms
                      ? 'border-red-500/50 bg-red-500/5'
                      : 'border-slate-700'
                  }`}>
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        required
                        checked={formData.acceptTerms}
                        onChange={(e) => setFormData({ ...formData, acceptTerms: e.target.checked })}
                        className="mt-1 w-5 h-5 rounded border-slate-600 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-900 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-white font-medium text-sm leading-relaxed">
                          {language === 'nl' && (
                            <>
                              Ik ga akkoord met de{' '}
                              <a
                                href="#/terms"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors"
                                onClick={(e) => {
                                  e.preventDefault();
                                  window.open('#/terms', '_blank');
                                }}
                              >
                                algemene voorwaarden
                              </a>{' '}
                              *
                            </>
                          )}
                          {language === 'tr' && (
                            <>
                              <a
                                href="#/terms"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors"
                                onClick={(e) => {
                                  e.preventDefault();
                                  window.open('#/terms', '_blank');
                                }}
                              >
                                Genel şartları
                              </a>{' '}
                              kabul ediyorum *
                            </>
                          )}
                          {language === 'fr' && (
                            <>
                              J'accepte les{' '}
                              <a
                                href="#/terms"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors"
                                onClick={(e) => {
                                  e.preventDefault();
                                  window.open('#/terms', '_blank');
                                }}
                              >
                                conditions générales
                              </a>{' '}
                              *
                            </>
                          )}
                          {language === 'de' && (
                            <>
                              Ich akzeptiere die{' '}
                              <a
                                href="#/terms"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors"
                                onClick={(e) => {
                                  e.preventDefault();
                                  window.open('#/terms', '_blank');
                                }}
                              >
                                Allgemeinen Geschäftsbedingungen
                              </a>{' '}
                              *
                            </>
                          )}
                          {!language && (
                            <>
                              Ik ga akkoord met de{' '}
                              <a
                                href="#/terms"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors"
                                onClick={(e) => {
                                  e.preventDefault();
                                  window.open('#/terms', '_blank');
                                }}
                              >
                                algemene voorwaarden
                              </a>{' '}
                              *
                            </>
                          )}
                        </p>
                        {error && !formData.acceptTerms && (
                          <p className="text-red-400 text-xs mt-2 flex items-start gap-1">
                            <span className="text-red-400">⚠</span>
                            <span>
                              {txt(language, {
                                nl: 'Je moet de algemene voorwaarden accepteren',
                                tr: 'Genel şartları kabul etmelisiniz',
                                fr: 'Vous devez accepter les conditions générales',
                                de: 'Sie müssen die AGB akzeptieren',
                              })}
                            </span>
                          </p>
                        )}
                      </div>
                    </label>
                  </div>

                  <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={formData.marketingOptIn}
                        onChange={(e) => setFormData({ ...formData, marketingOptIn: e.target.checked })}
                        className="mt-1 w-5 h-5 rounded border-slate-600 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-900"
                      />
                      <div>
                        <p className="text-white font-medium group-hover:text-cyan-400 transition-colors">
                          {txt(language, {
                            nl: 'Ik wil via e-mail op de hoogte blijven van toekomstige evenementen',
                            tr: 'Gelecekteki etkinlikler hakkında e-posta ile bilgilendirilmek istiyorum',
                            fr: 'Je souhaite recevoir des informations par e-mail sur les futurs événements',
                            de: 'Ich möchte per E-Mail über zukünftige Veranstaltungen informiert werden',
                          })}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {txt(language, {
                            nl: 'Je kunt je op elk moment uitschrijven. Zie ons privacybeleid voor meer informatie.',
                            tr: 'Dilediğiniz zaman aboneliğinizi iptal edebilirsiniz. Daha fazla bilgi için gizlilik politikamıza bakın.',
                            fr: 'Vous pouvez vous désabonner à tout moment. Consultez notre politique de confidentialité pour plus d\'informations.',
                            de: 'Sie können sich jederzeit abmelden. Weitere Informationen finden Sie in unserer Datenschutzerklärung.',
                          })}
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting || !formData.acceptTerms || formData.guests > ((selectedTable as any).max_guests || selectedTable.capacity) || formData.guests < 1}
                  className="w-full py-4 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold text-lg rounded-lg transition-all shadow-lg shadow-green-600/30"
                >
                  {submitting
                    ? txt(language, {
                        nl: 'Doorverwijzen naar betaling...',
                        tr: 'Ödemeye yönlendiriliyor...',
                        fr: 'Redirection vers le paiement...',
                        de: 'Weiterleitung zur Zahlung...',
                      })
                    : txt(language, {
                        nl: 'Direct afrekenen',
                        tr: 'Hemen öde',
                        fr: 'Payer maintenant',
                        de: 'Jetzt bezahlen',
                      })}
                </button>

                <p className="text-sm text-slate-400 text-center">
                  {txt(language, {
                    nl: 'Je wordt direct doorverwezen naar de beveiligde betaalpagina van Mollie.',
                    tr: 'Mollie güvenli ödeme sayfasına yönlendirileceksiniz.',
                    fr: 'Vous serez redirigé vers la page de paiement sécurisée de Mollie.',
                    de: 'Sie werden zur sicheren Zahlungsseite von Mollie weitergeleitet.',
                  })}
                </p>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
