import { Calendar, MapPin, Clock, Archive as ArchiveIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Database } from '../lib/supabaseClient';
import { useLanguage } from '../contexts/LanguageContext';
import { formatDate, formatTime, getDayName, getMonthDay } from '../lib/timezone';
import { localeMap } from '../lib/translations';
import { useDocumentHead } from '../hooks/useDocumentHead';

type Event = Database['public']['Tables']['events']['Row'];

interface ArchiveProps {
  onNavigate: (page: string) => void;
}

export function Archive({ onNavigate }: ArchiveProps) {
  const { language, t } = useLanguage();
  useDocumentHead({
    title: 'Evenement Archief',
    description: 'Bekijk eerdere evenementen van StageNation. Ons archief van concerten, feesten en culturele avonden.',
    path: '/archive',
  });
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPastEvents();
  }, []);

  async function loadPastEvents() {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('is_active', true)
        .lt('start_date', now)
        .order('start_date', { ascending: false });

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error('Error loading past events:', error);
    } finally {
      setLoading(false);
    }
  }

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

  if (loading) {
    return (
      <div className="py-20 px-4 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">{t('archive.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <ArchiveIcon className="w-10 h-10 text-cyan-400" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            {t('archive.title')} <span className="text-cyan-400">{t('archive.titleHighlight')}</span>
          </h1>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            {t('archive.subtitle')}
          </p>
        </div>

        {events.length === 0 ? (
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-12 text-center">
            <ArchiveIcon className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">{t('archive.noEvents')}</h3>
            <p className="text-slate-400">{t('archive.noEventsDesc')}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {events.map((event) => {
              const locale = getLocale();
              const monthDay = getMonthDay(event.start_date, locale);

              return (
                <div
                  key={event.id}
                  className="group bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl overflow-hidden opacity-75 hover:opacity-100 transition-all"
                >
                  <div className="flex flex-col md:flex-row">
                    {/* Event Poster or Date Box */}
                    {(event as any).poster_thumb_url ? (
                      <div className="md:w-64 relative overflow-hidden">
                        <img
                          src={(event as any).poster_thumb_url}
                          alt={event.name}
                          className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-300"
                        />
                        <div className="absolute top-3 left-3 bg-slate-600/90 backdrop-blur-sm text-white px-3 py-2 rounded-lg text-sm font-bold shadow-lg">
                          <div className="text-2xl leading-none">{monthDay.day}</div>
                          <div className="text-xs uppercase mt-1">{monthDay.month}</div>
                        </div>
                        {/* Past Event Badge */}
                        <div className="absolute bottom-3 right-3 bg-slate-800/90 backdrop-blur-sm px-3 py-1.5 rounded-lg">
                          <span className="text-slate-300 text-xs font-semibold uppercase">
                            {t('archive.pastEvent')}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="md:w-32 bg-slate-800/50 flex flex-col items-center justify-center p-6 border-b md:border-b-0 md:border-r border-slate-700">
                        <div className="text-4xl font-bold text-slate-500">{monthDay.day}</div>
                        <div className="text-sm text-slate-500 uppercase">{monthDay.month}</div>
                        <div className="text-xs text-slate-600 mt-1">{getDayName(event.start_date, locale)}</div>
                      </div>
                    )}

                    <div className="flex-1 p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <h2 className="text-3xl font-bold text-slate-300 group-hover:text-white transition-colors">
                              {event.name}
                            </h2>
                            <span className="px-3 py-1 bg-slate-700/50 border border-slate-600 rounded-full text-xs font-semibold text-slate-400 uppercase">
                              {t('archive.pastEvent')}
                            </span>
                          </div>
                          {getDescription(event) && (
                            <p className="text-slate-400 mb-4">{getDescription(event)}</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="flex items-center space-x-3 text-slate-400">
                          <div className="w-10 h-10 bg-slate-700/30 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Clock className="w-5 h-5 text-slate-500" />
                          </div>
                          <div>
                            <div className="text-xs text-slate-600">{t('agenda.startTime')}</div>
                            <div className="font-semibold">{formatTime(event.start_date, locale)}</div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-3 text-slate-400">
                          <div className="w-10 h-10 bg-slate-700/30 rounded-lg flex items-center justify-center flex-shrink-0">
                            <MapPin className="w-5 h-5 text-slate-500" />
                          </div>
                          <div>
                            <div className="text-xs text-slate-600">{t('agenda.location')}</div>
                            <div className="font-semibold">{event.location}</div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-3 text-slate-400">
                          <div className="w-10 h-10 bg-slate-700/30 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Calendar className="w-5 h-5 text-slate-500" />
                          </div>
                          <div>
                            <div className="text-xs text-slate-600">{t('agenda.date')}</div>
                            <div className="font-semibold">{formatDate(event.start_date, locale)}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Link back to upcoming events */}
        <div className="mt-12 text-center">
          <button
            onClick={() => onNavigate('agenda')}
            className="inline-flex items-center space-x-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg font-semibold transition-all"
          >
            <Calendar className="w-4 h-4" />
            <span>{t('archive.viewUpcoming')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
