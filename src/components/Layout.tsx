import { ReactNode, useState, useEffect } from 'react';
import { Menu, X, Ticket, Languages, Instagram } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../lib/supabaseClient';

interface LayoutProps {
  children: ReactNode;
  currentPage?: string;
  onNavigate?: (page: string) => void;
}

export function Layout({ children, currentPage = 'home', onNavigate }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [footerImages, setFooterImages] = useState<{ image_url: string; title: string | null }[]>([]);
  const { language, setLanguage, t } = useLanguage();

  useEffect(() => {
    async function loadFooterImages() {
      try {
        const { data } = await supabase
          .from('gallery_images')
          .select('image_url, title')
          .eq('is_active', true)
          .eq('category', 'footer')
          .order('display_order', { ascending: true })
          .limit(6);
        if (data && data.length > 0) setFooterImages(data);
      } catch {
        // Footer images not available
      }
    }
    loadFooterImages();
  }, []);

  const isTemporarilyOffline = () => {
    const now = new Date();
    const offlineUntil = new Date('2026-02-16T00:00:00+01:00');
    return now < offlineUntil;
  };

  const allNavItems = [
    { id: 'home', label: t('nav.home') },
    { id: 'agenda', label: t('nav.agenda'), offline: isTemporarilyOffline() },
    { id: 'location', label: t('nav.location') },
    { id: 'gallery', label: t('nav.gallery') },
    { id: 'contact', label: t('nav.contact') },
  ];

  const navItems = allNavItems.filter(item => !item.offline);

  const handleNavClick = (pageId: string) => {
    setMobileMenuOpen(false);
    if (onNavigate) {
      onNavigate(pageId);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-md border-b border-amber-900/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-28">
            <button
              onClick={() => handleNavClick('home')}
              className="flex items-center space-x-3 hover:opacity-80 transition-opacity"
            >
              <span className="text-amber-400 font-black text-2xl tracking-widest uppercase" style={{ letterSpacing: '0.12em' }}>
                STAGENATION
              </span>
            </button>

            <div className="hidden md:flex items-center space-x-1">
              <div className="relative group mr-2">
                <button
                  className="px-3 py-2 rounded-lg font-medium text-slate-300 hover:text-white hover:bg-amber-900/20 transition-all flex items-center space-x-1"
                >
                  <Languages className="w-4 h-4" />
                  <span className="text-sm font-semibold">{language?.toUpperCase()}</span>
                </button>
                <div className="absolute top-full right-0 mt-1 bg-slate-800 rounded-lg shadow-xl border border-amber-500/20 py-2 min-w-[140px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                  {([
                    { code: 'nl' as const, flag: '🇳🇱', label: 'Nederlands' },
                    { code: 'fr' as const, flag: '🇫🇷', label: 'Français' },
                    { code: 'de' as const, flag: '🇩🇪', label: 'Deutsch' },
                    { code: 'tr' as const, flag: '🇹🇷', label: 'Türkçe' },
                  ]).map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => setLanguage(lang.code)}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-amber-900/20 transition-colors ${
                        language === lang.code ? 'text-amber-400 font-semibold' : 'text-slate-300'
                      }`}
                    >
                      {lang.flag} {lang.label}
                    </button>
                  ))}
                </div>
              </div>
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    currentPage === item.id
                      ? 'bg-amber-900/20 text-amber-400'
                      : 'text-slate-300 hover:text-white hover:bg-amber-900/10'
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <button
                onClick={() => {
                  handleNavClick('home');
                  setTimeout(() => {
                    document.getElementById('tickets-section')?.scrollIntoView({ behavior: 'smooth' });
                  }, 100);
                }}
                className="ml-3 px-5 py-2 border border-amber-500 text-amber-400 hover:bg-amber-500 hover:text-black font-semibold rounded-lg transition-all uppercase tracking-wider text-sm"
              >
                {t('nav.bookTickets')}
              </button>
            </div>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-amber-900/20"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-black border-t border-amber-900/20">
            <div className="px-4 py-4 space-y-2">
              <div className="mb-2 pb-2 border-b border-amber-900/20">
                <div className="flex items-center space-x-2 mb-2 text-slate-400 text-sm">
                  <Languages className="w-4 h-4" />
                  <span>Taal / Langue / Sprache / Dil</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {([
                    { code: 'nl' as const, label: '🇳🇱 NL' },
                    { code: 'fr' as const, label: '🇫🇷 FR' },
                    { code: 'de' as const, label: '🇩🇪 DE' },
                    { code: 'tr' as const, label: '🇹🇷 TR' },
                  ]).map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => setLanguage(lang.code)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        language === lang.code
                          ? 'bg-amber-500 text-black'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-all ${
                    currentPage === item.id
                      ? 'bg-amber-900/20 text-amber-400'
                      : 'text-slate-300 hover:bg-amber-900/10'
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <button
                onClick={() => {
                  handleNavClick('home');
                  setTimeout(() => {
                    document.getElementById('tickets-section')?.scrollIntoView({ behavior: 'smooth' });
                  }, 100);
                }}
                className="w-full text-center px-4 py-3 border border-amber-500 text-amber-400 hover:bg-amber-500 hover:text-black font-semibold rounded-lg transition-all uppercase tracking-wider text-sm"
              >
                {t('nav.bookTickets')}
              </button>
            </div>
          </div>
        )}
      </nav>

      <main className="pt-28">
        {children}
      </main>

      {/* Scrolling Ticker Banner */}
      <div className="w-full overflow-hidden py-4" style={{ backgroundColor: '#23D3EE' }}>
        <div className="flex whitespace-nowrap" style={{ animation: 'ticker 20s linear infinite' }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="pr-16 text-white font-extrabold text-xl uppercase tracking-[0.25em]" style={{ fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }}>
              {t('footer.ticker')}
            </span>
          ))}
        </div>
        <style>{`
          @keyframes ticker {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
        `}</style>
      </div>

      {/* Footer Photo Banner */}
      {footerImages.length > 0 && (
        <div className="w-full">
          {footerImages.map((img, i) => (
            <img
              key={i}
              src={img.image_url}
              alt={img.title || ''}
              className="w-full h-auto block"
            />
          ))}
        </div>
      )}

      <footer className="bg-black border-t border-amber-900/20 mt-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <Ticket className="w-6 h-6 text-amber-400" />
                <span className="font-bold text-lg">StageNation</span>
              </div>
              <p className="text-slate-400 text-sm">
                Genk, België<br />
                {t('footer.tagline')}
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-4 text-amber-400">{t('footer.navigation')}</h3>
              <ul className="space-y-2 text-sm text-slate-400">
                {navItems.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => handleNavClick(item.id)}
                      className="hover:text-white transition-colors"
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    onClick={() => handleNavClick('archive')}
                    className="hover:text-white transition-colors"
                  >
                    {t('archive.title')} {t('archive.titleHighlight')}
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-4 text-amber-400">{t('footer.contact')}</h3>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>info@stagenation.be</li>
                <li>
                  <a href="tel:+32493944631" className="hover:text-white transition-colors">
                    0493 94 46 31
                  </a>
                </li>
                <li className="pt-2">
                  <a
                    href="https://www.instagram.com/stagenation/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-2 text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    <Instagram className="w-5 h-5" />
                    <span>@stagenation</span>
                  </a>
                </li>
                <li className="pt-3 border-t border-slate-700 mt-3">
                  <button
                    onClick={() => handleNavClick('terms')}
                    className="hover:text-white transition-colors"
                  >
                    {t('footer.terms')}
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handleNavClick('privacy')}
                    className="hover:text-white transition-colors"
                  >
                    {t('footer.privacy')}
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-amber-900/20 mt-6 pt-6">
            <div className="flex flex-col items-center">

              <p className="text-center text-sm text-slate-500 mb-2">
                &copy; {new Date().getFullYear()} StageNation alle rechten voorbehouden
              </p>
              <p className="text-center text-xs text-slate-600">
                Powered by Lumetrix | BTW: BE1029.601.154
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
