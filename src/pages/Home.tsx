import { Calendar, MapPin, Clock, Ticket, ArrowRight, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Database } from '../lib/supabaseClient';
import { useLanguage } from '../contexts/LanguageContext';
import { formatTime } from '../lib/timezone';
import { localeMap } from '../lib/translations';
import { useDocumentHead } from '../hooks/useDocumentHead';

type Event = Database['public']['Tables']['events']['Row'];

const EVENTS_PER_PAGE = 6;

interface HomeProps {
  onNavigate: (page: string) => void;
}

export function Home({ onNavigate }: HomeProps) {
  const { language, t } = useLanguage();
  useDocumentHead({
    title: 'StageNation',
    description: 'Premium events en veilige ticketing. Koop je tickets online voor concerten, feesten en culturele evenementen.',
    path: '/',
  });
  const [events, setEvents] = useState<Event[]>([]);
  const [featuredEvent, setFeaturedEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, _setPage] = useState(0);
  const [, setTotalCount] = useState(0);
  const [heroImages, setHeroImages] = useState<string[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const sliderRef = useRef<HTMLDivElement>(null);

  const isTemporarilyOffline = () => {
    const now = new Date();
    const offlineUntil = new Date('2026-02-16T00:00:00+01:00');
    return now < offlineUntil;
  };

  useEffect(() => {
    loadEvents();
    loadHeroImages();
  }, [page]);

  async function loadHeroImages() {
    try {
      const { data } = await supabase
        .from('gallery_images')
        .select('image_url')
        .eq('category', 'hero')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .limit(10000);
      if (data && data.length > 0) {
        setHeroImages(data.map(d => d.image_url));
      }
    } catch {
      // No hero images set, will use event poster as fallback
    }
  }

  // Auto-rotate hero images
  useEffect(() => {
    if (heroImages.length <= 1) return;
    const interval = setInterval(() => {
      setHeroIndex(prev => (prev + 1) % heroImages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [heroImages.length]);

  async function loadEvents() {
    try {
      if (page === 0) {
        const { count } = await supabase
          .from('events')
          .select('*', { count: 'exact', head: true })
          .eq('is_active', true)
          .gte('start_date', new Date().toISOString());
        setTotalCount(count || 0);
      }

      const from = page * EVENTS_PER_PAGE;
      const to = from + EVENTS_PER_PAGE - 1;

      const { data: rows, error } = await supabase
        .from('events')
        .select('*')
        .eq('is_active', true)
        .gte('start_date', new Date().toISOString())
        .order('start_date', { ascending: true })
        .range(from, to);

      if (error) throw error;

      const data = rows || [];
      if (data.length > 0) {
        if (page === 0) setFeaturedEvent(data[0]);
        setEvents(data);
      }
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  }

  const getLocale = () => {
    return language ? localeMap[language] : 'nl-BE';
  };

  const formatDateWithDay = (dateString: string) => {
    const locale = getLocale();
    const date = new Date(dateString);
    return date.toLocaleDateString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Europe/Brussels',
    });
  };

  const getLineup = (event: Event) => {
    if (!event?.metadata) return [];
    const metadata = event.metadata as { lineup?: string[] };
    return metadata.lineup || [];
  };

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScrollability = () => {
    if (sliderRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = sliderRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 5);
    }
  };

  useEffect(() => {
    checkScrollability();
    const el = sliderRef.current;
    if (el) {
      el.addEventListener('scroll', checkScrollability);
      window.addEventListener('resize', checkScrollability);
      return () => {
        el.removeEventListener('scroll', checkScrollability);
        window.removeEventListener('resize', checkScrollability);
      };
    }
  }, [events]);

  const scrollSlider = (direction: 'left' | 'right') => {
    if (sliderRef.current) {
      const scrollAmount = 360;
      sliderRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">{t('home.loading')}</p>
        </div>
      </div>
    );
  }

  const offlineMode = isTemporarilyOffline();

  // If no upcoming events, show a graceful empty state with a default background
  if (!featuredEvent || offlineMode) {
    return (
      <div className="bg-black">
        <section className="relative h-[100dvh] flex flex-col justify-center overflow-hidden">
          <div className="absolute inset-0">
            {heroImages.length > 0 ? (
              <img
                src={heroImages[0]}
                alt="Background"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-slate-900" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-amber-900/10 to-transparent" />
          </div>

          <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center">
              <Calendar className="w-20 h-20 text-slate-500 mx-auto mb-8 opacity-50" />
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-6 tracking-tight">
                {offlineMode ? t('home.patience') : t('home.noEvents')}
              </h1>
              <p className="text-xl text-slate-300">
                {offlineMode ? t('home.patienceDesc') : t('home.noEventsDesc')}
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const lineup = getLineup(featuredEvent);

  return (
    <div className="bg-black">
      <section className="relative h-[100dvh] flex flex-col overflow-hidden">
        <div className="absolute inset-0">
          {heroImages.length > 1 ? (
            <>
              {heroImages.map((url, i) => (
                <img
                  key={url}
                  src={url}
                  alt={featuredEvent.name}
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
                    i === heroIndex ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              ))}
            </>
          ) : (
            <img
              src={heroImages[0] || featuredEvent.poster_url || featuredEvent.poster_thumb_url || '/images/event-hero.jpeg'}
              alt={featuredEvent.name}
              className="w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-amber-900/20 to-transparent" />
        </div>


        <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8" style={{ marginTop: '55vh' }}>
          <div className="max-w-7xl mx-auto w-full">
            <div className="inline-flex items-center space-x-2 mb-3 px-3 py-1.5 bg-amber-500/10 backdrop-blur-sm border border-amber-500/30 rounded-full">
              <span className="text-amber-300 font-semibold text-xs uppercase tracking-wider">
                {t('home.nextEvent')}
              </span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-3 tracking-tight">
              {featuredEvent.name}
            </h1>

            {lineup.length > 0 && (
              <div className="mb-3">
                <div className="flex flex-wrap items-center gap-2">
                  {lineup.map((artist, index) => (
                    <div key={artist} className="flex items-center gap-2">
                      <span className="text-xl md:text-2xl font-bold text-white/90">{artist}</span>
                      {index < lineup.length - 1 && (
                        <span className="text-xl text-amber-400">•</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4 mb-3 text-white/80 text-sm">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                <span className="font-medium">{formatDateWithDay(featuredEvent.start_date)}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="font-medium">{formatTime(featuredEvent.start_date, getLocale())}</span>
              </div>
              <a
                href="https://www.google.com/maps/search/?api=1&query=Limburghal,Jaarbeurslaan+6,Genk,Belgium"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-2 hover:text-amber-400 transition-colors"
                title="Google Haritalar'da Aç"
              >
                <MapPin className="w-4 h-4 text-amber-400" />
                <span className="font-medium">Limburghal, Genk</span>
              </a>
              <button
                onClick={() => onNavigate(`tickets?event=${featuredEvent.slug}`)}
                className="inline-flex items-center space-x-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-all shadow-lg shadow-amber-500/30 hover:shadow-amber-400/40"
              >
                <Ticket className="w-5 h-5" />
                <span>{t('home.buyTickets')}</span>
              </button>
            </div>
          </div>

          {/* Scroll down indicator */}
          <button
            onClick={() => {
              const el = document.getElementById('tickets-section');
              if (el) {
                const y = el.getBoundingClientRect().top + window.scrollY - 100;
                window.scrollTo({ top: y, behavior: 'smooth' });
              }
            }}
            className="mt-16 w-full flex flex-col items-center gap-1 group cursor-pointer"
            aria-label="Scroll down"
          >
            <span className="text-white/60 text-xs font-semibold uppercase tracking-[0.3em] group-hover:text-amber-400 transition-colors">
              {t('home.scrollDown')}
            </span>
            <ChevronDown className="w-8 h-8 text-white/50 group-hover:text-amber-400 transition-colors animate-bounce" />
          </button>
        </div>
      </section>

      {/* Events Section - Horizontal Slider */}
      {events.length > 0 && (
        <section id="tickets-section" className="py-24 px-4 sm:px-6 lg:px-8 bg-black relative">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/10 via-transparent to-transparent" />
          <div className="max-w-7xl mx-auto relative">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold text-white">
                {t('home.eventsSectionTitle')} <span className="text-amber-400">{t('home.eventsSectionHighlight')}</span>
              </h2>
              <div className="mt-4 w-16 h-1 bg-amber-500 mx-auto rounded-full" />
            </div>

            {/* Slider Container */}
            <div className="relative">
              {/* Scrollable Events */}
              <div
                ref={sliderRef}
                className="flex gap-6 overflow-x-auto pb-2 snap-x snap-mandatory px-1"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {events.map((event) => {
                  const eventDate = new Date(event.start_date);
                  const day = eventDate.toLocaleDateString(getLocale(), { day: '2-digit', timeZone: 'Europe/Brussels' });
                  const month = eventDate.toLocaleDateString(getLocale(), { month: 'short', timeZone: 'Europe/Brussels' }).toUpperCase();
                  const eventLineup = getLineup(event);

                  return (
                    <div
                      key={event.id}
                      className="group flex-shrink-0 w-[calc(100%-16px)] sm:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] snap-start rounded-2xl overflow-hidden bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-amber-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/5"
                    >
                      {/* Event Image */}
                      <div className="relative w-full aspect-[4/3] overflow-hidden">
                        <img
                          src={event.poster_url || event.poster_thumb_url || '/images/event-hero.jpeg'}
                          alt={event.name}
                          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-700"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                        {/* Date badge */}
                        <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md rounded-xl px-3 py-2 text-center min-w-[52px] border border-white/10">
                          <div className="text-lg font-black text-white leading-none">{day}</div>
                          <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mt-0.5">{month}</div>
                        </div>
                      </div>

                      {/* Event Info */}
                      <div className="p-5">
                        <h3 className="text-lg font-bold text-white mb-3 group-hover:text-amber-400 transition-colors truncate">
                          {event.name}
                        </h3>

                        {eventLineup.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {eventLineup.slice(0, 3).map((artist) => (
                              <span key={artist} className="text-xs text-slate-300 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">
                                {artist}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400 mb-5">
                          <div className="flex items-center space-x-1.5">
                            <Clock className="w-3.5 h-3.5 text-amber-500/70" />
                            <span>{formatTime(event.start_date, getLocale())}</span>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <MapPin className="w-3.5 h-3.5 text-amber-500/70" />
                            <span className="truncate">{event.location || 'Limburghal, Genk'}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => onNavigate(`tickets?event=${event.slug}`)}
                          className="w-full inline-flex items-center justify-center space-x-2 px-5 py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-all text-sm shadow-lg shadow-amber-500/10 hover:shadow-amber-400/20"
                        >
                          <Ticket className="w-4 h-4" />
                          <span>{t('home.getTickets')}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Navigation Arrows */}
              {events.length > 3 && (
                <div className="flex items-center justify-center gap-4 mt-8">
                  <button
                    onClick={() => scrollSlider('left')}
                    className={`w-14 h-14 rounded-full border-2 flex items-center justify-center transition-all ${
                      canScrollLeft
                        ? 'border-white/40 text-white hover:border-amber-400 hover:text-amber-400'
                        : 'border-white/10 text-white/20 cursor-default'
                    }`}
                    disabled={!canScrollLeft}
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    onClick={() => scrollSlider('right')}
                    className={`w-14 h-14 rounded-full border-2 flex items-center justify-center transition-all ${
                      canScrollRight
                        ? 'border-white/40 text-white hover:border-amber-400 hover:text-amber-400'
                        : 'border-white/10 text-white/20 cursor-default'
                    }`}
                    disabled={!canScrollRight}
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </div>
              )}
            </div>

            <div className="text-center mt-12">
              <button
                onClick={() => onNavigate('agenda')}
                className="inline-flex items-center space-x-2 px-6 py-3 border border-white/10 hover:border-amber-500/30 rounded-xl text-slate-400 hover:text-amber-400 font-medium transition-all text-sm"
              >
                <span>{t('home.viewAllEvents')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>
      )}

    </div>
  );
}
