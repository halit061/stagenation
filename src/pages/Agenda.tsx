import { Calendar, MapPin, Clock, Ticket, ChevronRight, ChevronLeft, Search, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Database } from '../lib/supabaseClient';
import { useLanguage } from '../contexts/LanguageContext';
import { formatDate, formatTime, getDayName, getMonthDay } from '../lib/timezone';
import { CountdownTimer } from '../components/CountdownTimer';
import { localeMap } from '../lib/translations';
import { useDocumentHead } from '../hooks/useDocumentHead';

type Event = Database['public']['Tables']['events']['Row'];

const EVENTS_PER_PAGE = 4;

interface AgendaProps {
  onNavigate: (page: string) => void;
}

export function Agenda({ onNavigate: _onNavigate }: AgendaProps) {
  const { language, t } = useLanguage();
  useDocumentHead({
    title: 'Evenementen & Agenda',
    description: 'Bekijk alle aankomende evenementen van StageNation. Concerten, feesten en culturele avonden.',
    path: '/agenda',
  });
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [subscribeEmail, setSubscribeEmail] = useState('');
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeSuccess, setSubscribeSuccess] = useState(false);
  const [subscribeError, setSubscribeError] = useState('');

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
  }, [page, searchQuery]);

  async function loadEvents() {
    try {
      let countQuery = supabase
        .from('events')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      if (searchQuery.trim()) {
        countQuery = countQuery.ilike('name', `%${searchQuery.trim()}%`);
      }

      const { count } = await countQuery;
      setTotalCount(count || 0);

      const from = page * EVENTS_PER_PAGE;
      const to = from + EVENTS_PER_PAGE - 1;

      let query = supabase
        .from('events')
        .select('*')
        .eq('is_active', true)
        .order('start_date', { ascending: false })
        .range(from, to);

      if (searchQuery.trim()) {
        query = query.ilike('name', `%${searchQuery.trim()}%`);
      }

      const { data: rows, error } = await query;

      if (error) throw error;
      setEvents(rows || []);
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleSubscribe = async () => {
    const email = subscribeEmail.trim();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setSubscribeError(t('agenda.invalidEmail') || 'Invalid email');
      return;
    }
    setSubscribing(true);
    setSubscribeError('');
    try {
      const { error } = await supabase.rpc('add_to_mailing_list', {
        p_email: email,
        p_source: 'agenda_signup',
      });
      if (error) throw error;
      setSubscribeSuccess(true);
      setSubscribeEmail('');
    } catch {
      setSubscribeError(t('agenda.subscribeError') || 'Something went wrong');
    } finally {
      setSubscribing(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setPage(0);
  };

  const getLocale = () => {
    return language ? localeMap[language] : 'nl-BE';
  };

  const getDescription = (event: Event) => {
    if (!event.metadata) return event.description || '';
    const metadata = event.metadata as { description_nl?: string; description_tr?: string; description_en?: string; description_fr?: string; description_de?: string };
    if (language === 'fr' && metadata.description_fr) return metadata.description_fr;
    if (language === 'de' && metadata.description_de) return metadata.description_de;
    if (language === 'tr' && metadata.description_tr) return metadata.description_tr;
    if (language === 'nl' && metadata.description_nl) return metadata.description_nl;
    return event.description || '';
  };

  const getLineup = (event: Event) => {
    if (!event?.metadata) return [];
    const metadata = event.metadata as { lineup?: string[] };
    return metadata.lineup || [];
  };

  const isPastEvent = (event: Event) => new Date(event.start_date) < new Date();

  const totalPages = Math.ceil(totalCount / EVENTS_PER_PAGE);
  const canPrev = page > 0;
  const canNext = page < totalPages - 1;

  if (isTemporarilyOffline()) {
    return (
      <div className="py-20 px-4 flex items-center justify-center min-h-screen bg-black">
        <div className="text-center max-w-2xl">
          <Calendar className="w-20 h-20 text-slate-600 mx-auto mb-6" />
          <h2 className="text-3xl font-bold mb-4 text-white">
            {t('agenda.temporarilyOffline')}
          </h2>
          <p className="text-slate-400 text-lg">
            {t('agenda.offlineDesc')}
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-20 px-4 flex items-center justify-center min-h-screen bg-black">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">{t('agenda.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pt-20 pb-16">
      {/* Header */}
      <div className="px-4 sm:px-6 lg:px-8 mb-12">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-6xl font-black text-white mb-4 tracking-tight">
              {t('agenda.title')} <span className="text-amber-400">{t('agenda.titleHighlight')}</span>
            </h1>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              {t('agenda.subtitle')}
            </p>
          </div>

          {/* Search Bar */}
          <div className="max-w-xl mx-auto">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder={t('agenda.searchPlaceholder') || 'Etkinlik ara...'}
                className="w-full pl-12 pr-12 py-3.5 bg-white/[0.04] border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:bg-white/[0.06] transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => handleSearch('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Events */}
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          {events.length === 0 ? (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-slate-800 rounded-2xl mb-6">
                <Calendar className="w-10 h-10 text-slate-600" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">{t('agenda.noEvents')}</h3>
              <p className="text-slate-400 max-w-md mx-auto">{t('agenda.noEventsDesc')}</p>
            </div>
          ) : (
            <div className="space-y-8">
              {events.map((event, index) => {
                const locale = getLocale();
                const monthDay = getMonthDay(event.start_date, locale);
                const lineup = getLineup(event);
                const description = getDescription(event);
                const past = isPastEvent(event);
                const isFirst = index === 0 && page === 0 && !past;

                return (
                  <div
                    key={event.id}
                    className={`group relative rounded-2xl overflow-hidden transition-all duration-500 ${
                      past
                        ? 'ring-1 ring-white/5 opacity-75 hover:opacity-100'
                        : isFirst
                          ? 'ring-1 ring-amber-500/30 shadow-2xl shadow-amber-500/10'
                          : 'ring-1 ring-white/10 hover:ring-amber-500/30'
                    }`}
                  >
                    {/* Badges */}
                    <div className="absolute top-4 right-4 z-20 flex gap-2">
                      {past && (
                        <div className="px-3 py-1 bg-slate-600/80 backdrop-blur-sm text-white text-xs font-bold uppercase tracking-wider rounded-full">
                          {t('agenda.pastEvent') || 'Geçmiş Etkinlik'}
                        </div>
                      )}
                      {isFirst && (
                        <div className="px-3 py-1 bg-amber-500 text-black text-xs font-bold uppercase tracking-wider rounded-full">
                          {t('home.nextEvent')}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col lg:flex-row">
                      {/* Event Image */}
                      <div className={`relative overflow-hidden ${isFirst ? 'lg:w-[420px]' : 'lg:w-[340px]'} shrink-0`}>
                        {event.poster_thumb_url || event.poster_url ? (
                          <img
                            src={event.poster_url || event.poster_thumb_url || ''}
                            alt={event.name}
                            className={`w-full object-cover group-hover:scale-105 transition-transform duration-700 ${
                              isFirst ? 'h-64 lg:h-full' : 'h-56 lg:h-full'
                            } ${past ? 'grayscale' : ''}`}
                          />
                        ) : (
                          <div className={`w-full bg-gradient-to-br from-amber-500/20 via-amber-600/10 to-black flex flex-col items-center justify-center ${
                            isFirst ? 'h-64 lg:h-full' : 'h-56 lg:h-full'
                          }`}>
                            <div className="text-6xl font-black text-amber-400">{monthDay.day}</div>
                            <div className="text-lg text-amber-300/70 uppercase font-semibold mt-1">{monthDay.month}</div>
                            <div className="text-sm text-slate-500 mt-1">{getDayName(event.start_date, locale)}</div>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/50 lg:block hidden" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent lg:hidden" />

                        {(event.poster_thumb_url || event.poster_url) && (
                          <div className="absolute bottom-3 left-3 bg-black/80 backdrop-blur-sm px-3 py-2 rounded-xl">
                            <div className="text-2xl font-black text-amber-400 leading-none">{monthDay.day}</div>
                            <div className="text-xs text-amber-300/70 uppercase font-semibold mt-0.5">{monthDay.month}</div>
                          </div>
                        )}
                      </div>

                      {/* Event Content */}
                      <div className="flex-1 p-6 lg:p-8 bg-gradient-to-br from-slate-900/90 to-black flex flex-col justify-between">
                        <div>
                          <h2 className={`font-black text-white mb-3 tracking-tight group-hover:text-amber-400 transition-colors ${
                            isFirst ? 'text-3xl lg:text-4xl' : 'text-2xl lg:text-3xl'
                          }`}>
                            {event.name}
                          </h2>

                          {lineup.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-4">
                              {lineup.map((artist) => (
                                <span
                                  key={artist}
                                  className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-sm text-slate-300 font-medium"
                                >
                                  {artist}
                                </span>
                              ))}
                            </div>
                          )}

                          {description && (
                            <p className="text-slate-400 mb-5 line-clamp-2 leading-relaxed">
                              {description}
                            </p>
                          )}

                          {!past && (
                            <div className="mb-5">
                              <CountdownTimer targetDate={event.start_date} />
                            </div>
                          )}

                          <div className="flex flex-wrap gap-5 mb-6">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 bg-amber-500/10 rounded-lg flex items-center justify-center">
                                <Clock className="w-4 h-4 text-amber-400" />
                              </div>
                              <div>
                                <div className="text-[11px] text-slate-500 uppercase tracking-wide">{t('agenda.startTime')}</div>
                                <div className="text-sm font-semibold text-white">{formatTime(event.start_date, locale)}</div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 bg-amber-500/10 rounded-lg flex items-center justify-center">
                                <MapPin className="w-4 h-4 text-amber-400" />
                              </div>
                              <div>
                                <div className="text-[11px] text-slate-500 uppercase tracking-wide">{t('agenda.location')}</div>
                                <div className="text-sm font-semibold text-white">{event.location}</div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 bg-amber-500/10 rounded-lg flex items-center justify-center">
                                <Calendar className="w-4 h-4 text-amber-400" />
                              </div>
                              <div>
                                <div className="text-[11px] text-slate-500 uppercase tracking-wide">{t('agenda.date')}</div>
                                <div className="text-sm font-semibold text-white">{formatDate(event.start_date, locale)}</div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div>
                          {!past ? (
                            <button
                              onClick={() => {
                                window.location.href = `/tickets?event=${event.slug}`;
                              }}
                              className={`inline-flex items-center gap-2 font-bold rounded-xl transition-all ${
                                isFirst
                                  ? 'px-8 py-4 bg-amber-500 hover:bg-amber-400 text-black text-base shadow-lg shadow-amber-500/20 hover:shadow-amber-400/30'
                                  : 'px-6 py-3 bg-white/10 hover:bg-amber-500 text-white hover:text-black text-sm border border-white/10 hover:border-amber-500'
                              }`}
                            >
                              <Ticket className="w-4 h-4" />
                              <span>{t('agenda.buyTickets')}</span>
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-2 px-6 py-3 bg-white/5 text-slate-500 text-sm font-medium rounded-xl border border-white/5">
                              <Calendar className="w-4 h-4" />
                              {t('agenda.pastEvent') || 'Geçmiş Etkinlik'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-12">
              <button
                onClick={() => { setPage(p => Math.max(0, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                disabled={!canPrev}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                  canPrev ? 'bg-white/10 hover:bg-amber-500 text-white hover:text-black' : 'bg-white/5 text-slate-600 cursor-not-allowed'
                }`}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => { setPage(i); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    page === i
                      ? 'bg-amber-500 text-black'
                      : 'bg-white/10 text-slate-400 hover:bg-white/20 hover:text-white'
                  }`}
                >
                  {i + 1}
                </button>
              ))}

              <button
                onClick={() => { setPage(p => Math.min(totalPages - 1, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                disabled={!canNext}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                  canNext ? 'bg-white/10 hover:bg-amber-500 text-white hover:text-black' : 'bg-white/5 text-slate-600 cursor-not-allowed'
                }`}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Newsletter */}
          <div className="mt-16">
            <div className="relative rounded-2xl overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-amber-600/5" />
              <div className="relative p-8 lg:p-10 border border-amber-500/20 rounded-2xl">
                <div className="max-w-2xl">
                  <h3 className="text-2xl font-bold text-white mb-2">{t('agenda.eventUpdates')}</h3>
                  <p className="text-slate-400 mb-6">
                    {t('agenda.stayUpdated')}
                  </p>
                  {subscribeSuccess ? (
                    <div className="flex items-center gap-3 px-5 py-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                      <span className="text-green-400 text-lg">✓</span>
                      <p className="text-green-300 font-medium">{t('agenda.subscribeSuccess')}</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <input
                          type="email"
                          value={subscribeEmail}
                          onChange={(e) => { setSubscribeEmail(e.target.value); setSubscribeError(''); }}
                          onKeyDown={(e) => e.key === 'Enter' && handleSubscribe()}
                          placeholder={t('agenda.emailPlaceholder')}
                          className="flex-1 px-5 py-3 bg-black/50 border border-white/10 rounded-xl focus:outline-none focus:border-amber-500 text-white placeholder-slate-500"
                        />
                        <button
                          onClick={handleSubscribe}
                          disabled={subscribing}
                          className="px-8 py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {subscribing ? '...' : t('agenda.subscribe')}
                        </button>
                      </div>
                      {subscribeError && (
                        <p className="mt-2 text-red-400 text-sm">{subscribeError}</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
