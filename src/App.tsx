import { useState, useEffect, lazy, Suspense, useCallback } from 'react';
import { Shield } from 'lucide-react';
import { Layout } from './components/Layout';
import { LanguageSelector } from './components/LanguageSelector';
import { SplashScreen } from './components/SplashScreen';
import { CookieBanner } from './components/CookieBanner';
import { ChatAssistant } from './components/ChatAssistant';
import { JsonLd } from './components/JsonLd';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { useLanguage } from './contexts/LanguageContext';
import { useAuth } from './contexts/AuthContext';

const Agenda = lazy(() => import('./pages/Agenda').then(m => ({ default: m.Agenda })));
const Info = lazy(() => import('./pages/Info').then(m => ({ default: m.Info })));
const Location = lazy(() => import('./pages/Location').then(m => ({ default: m.Location })));
const Gallery = lazy(() => import('./pages/Gallery').then(m => ({ default: m.Gallery })));
const Tickets = lazy(() => import('./pages/Tickets').then(m => ({ default: m.Tickets })));
const TableReservation = lazy(() => import('./pages/TableReservation').then(m => ({ default: m.TableReservation })));
const Contact = lazy(() => import('./pages/Contact').then(m => ({ default: m.Contact })));
const Scanner = lazy(() => import('./pages/Scanner').then(m => ({ default: m.Scanner })));
const Admin = lazy(() => import('./pages/Admin').then(m => ({ default: m.Admin })));
const SuperAdmin = lazy(() => import('./pages/SuperAdmin').then(m => ({ default: m.SuperAdmin })));
const MailingList = lazy(() => import('./pages/MailingList').then(m => ({ default: m.MailingList })));
const PaymentSuccess = lazy(() => import('./pages/PaymentSuccess'));
const TermsAndConditions = lazy(() => import('./pages/TermsAndConditions').then(m => ({ default: m.TermsAndConditions })));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })));
const Archive = lazy(() => import('./pages/Archive').then(m => ({ default: m.Archive })));
const TicketView = lazy(() => import('./pages/TicketView').then(m => ({ default: m.TicketView })));
const SuperAdminReset = lazy(() => import('./pages/SuperAdminReset').then(m => ({ default: m.SuperAdminReset })));
const SeatPicker = lazy(() => import('./pages/SeatPicker').then(m => ({ default: m.SeatPicker })));
const SeatCheckout = lazy(() => import('./pages/SeatCheckout').then(m => ({ default: m.SeatCheckout })));
const SeatConfirmation = lazy(() => import('./pages/SeatConfirmation').then(m => ({ default: m.SeatConfirmation })));

function getPageFromUrl(): string {
  const path = window.location.pathname.replace(/^\/+/, '') || 'home';
  return path;
}

function App() {
  const [currentPage, setCurrentPage] = useState(getPageFromUrl);
  const [showSplash, setShowSplash] = useState(() => {
    if (window.__PRERENDER_INJECTED?.isPrerendering) return false;
    const seen = sessionStorage.getItem('stagenation_splash_seen');
    return !seen;
  });
  const { language, setLanguage } = useLanguage();
  const { user, role, loading, isSuperAdmin, isAdmin, isScanner, getRedirectPath } = useAuth();

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
    sessionStorage.setItem('stagenation_splash_seen', '1');
  }, []);

  const navigate = useCallback((page: string) => {
    const clean = page.replace(/^\/+/, '');
    setCurrentPage(clean);
    const newPath = '/' + clean;
    if (window.location.pathname !== newPath) {
      window.history.pushState(null, '', newPath);
    }
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPage(getPageFromUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (loading) return;

    const page = currentPage.split('?')[0].replace(/^\/+/, '');

    if (page === 'superadmin') {
      if (!user || !isSuperAdmin()) {
        if (user && role) {
          navigate(getRedirectPath());
        } else {
          navigate('login');
        }
      }
    } else if (page === 'admin' || page === 'dashboard') {
      if (!user || !isAdmin()) {
        if (user && role) {
          navigate(getRedirectPath());
        } else {
          navigate('login');
        }
      }
    } else if (page === 'scanner') {
      if (!user || !isScanner()) {
        if (user && role) {
          navigate(getRedirectPath());
        } else {
          navigate('login');
        }
      }
    }
  }, [currentPage, user, role, loading, isSuperAdmin, isAdmin, isScanner, getRedirectPath, navigate]);

  // Dynamic html lang attribute
  useEffect(() => {
    const langMap: Record<string, string> = { nl: 'nl', tr: 'tr', fr: 'fr', de: 'de' };
    document.documentElement.lang = language ? langMap[language] || 'nl' : 'nl';
  }, [language]);

  // Signal pre-renderer that content is ready
  useEffect(() => {
    if (window.__PRERENDER_INJECTED?.isPrerendering) {
      const timer = setTimeout(() => {
        document.dispatchEvent(new Event('prerender-ready'));
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [currentPage]);

  const PROTECTED_PAGES: Record<string, (typeof isAdmin | typeof isSuperAdmin | typeof isScanner)> = {
    scanner: isScanner,
    admin: isAdmin,
    dashboard: isAdmin,
    superadmin: isSuperAdmin,
  };

  const renderPage = () => {
    let page = currentPage.split('?')[0];
    page = page.replace(/^\/+/, '');

    const requiredRoleCheck = PROTECTED_PAGES[page];

    if (requiredRoleCheck) {
      if (loading) {
        return (
          <div className="min-h-screen bg-slate-900 flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
          </div>
        );
      }
      if (!user) {
        return <Login onNavigate={navigate} />;
      }
      if (!requiredRoleCheck()) {
        return (
          <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="text-center max-w-md">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500/20 rounded-full mb-4">
                <Shield className="w-8 h-8 text-red-400" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Geen Toegang</h1>
              <p className="text-slate-400 mb-6">Je hebt niet de juiste rechten voor deze pagina.</p>
              <button
                onClick={() => navigate(getRedirectPath())}
                className="px-6 py-3 bg-red-500 hover:bg-red-400 rounded-lg font-semibold text-white transition-colors"
              >
                Ga terug
              </button>
            </div>
          </div>
        );
      }
    }

    switch (page) {
      case 'home':
        return <Home onNavigate={navigate} />;
      case 'agenda':
        return <Agenda onNavigate={navigate} />;
      case 'info':
        return <Info />;
      case 'location':
        return <Location />;
      case 'gallery':
        return <Gallery />;
      case 'tickets':
        return <Tickets onNavigate={navigate} />;
      case 'queue':
        return <Tickets onNavigate={navigate} />;
      case 'table-reservation':
        return <TableReservation onNavigate={navigate} />;
case 'contact':
        return <Contact />;
      case 'login':
        return <Login onNavigate={navigate} />;
      case 'scanner':
        return <Scanner />;
      case 'dashboard':
      case 'admin':
        return <Admin onNavigate={navigate} />;
      case 'superadmin':
        return <SuperAdmin onNavigate={navigate} />;
      case 'mailing':
        return <MailingList />;
      case 'payment-success': {
        return <PaymentSuccess />;
      }
      case 'terms':
      case 'terms-nl':
      case 'terms-en':
      case 'terms-tr':
        return <TermsAndConditions />;
      case 'privacy':
      case 'privacy-policy':
        return <PrivacyPolicy />;
      case 'archive':
        return <Archive onNavigate={navigate} />;
      case 'superadmin-reset':
      case 'superadmin-reset.html':
        return <SuperAdminReset />;
      case 'ticket-view': {
        const params = new URLSearchParams(window.location.search);
        const tokenParam = params.get('token') || '';
        return <TicketView token={tokenParam} />;
      }
      case 'seat-picker': {
        const seatParams = new URLSearchParams(window.location.search);
        const seatEventId = seatParams.get('event') || '';
        if (!seatEventId) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Event ID ontbreekt</div>;
        return <SeatPicker eventId={seatEventId} onNavigate={navigate} />;
      }
      case 'seat-checkout': {
        const checkoutParams = new URLSearchParams(window.location.search);
        const checkoutEventId = checkoutParams.get('event') || '';
        if (!checkoutEventId) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Event ID ontbreekt</div>;
        return <SeatCheckout eventId={checkoutEventId} onNavigate={navigate} />;
      }
      case 'seat-confirmation': {
        const confirmParams = new URLSearchParams(window.location.search);
        const confirmEventId = confirmParams.get('event') || '';
        const confirmOrderId = confirmParams.get('order') || '';
        if (!confirmEventId || !confirmOrderId) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Bestelling niet gevonden</div>;
        return <SeatConfirmation eventId={confirmEventId} orderId={confirmOrderId} onNavigate={navigate} />;
      }
      default:
        return (
          <div className="min-h-screen flex items-center justify-center p-4">
            <div className="text-center max-w-md">
              <p className="text-8xl font-black text-amber-400 mb-4">404</p>
              <h1 className="text-2xl font-bold text-white mb-2">
                {language === 'tr' ? 'Sayfa Bulunamadı' : language === 'fr' ? 'Page introuvable' : language === 'de' ? 'Seite nicht gefunden' : 'Pagina niet gevonden'}
              </h1>
              <p className="text-slate-400 mb-8">
                {language === 'tr' ? 'Aradığınız sayfa mevcut değil veya taşınmış olabilir.' : language === 'fr' ? 'La page que vous recherchez n\'existe pas ou a été déplacée.' : language === 'de' ? 'Die Seite, die Sie suchen, existiert nicht oder wurde verschoben.' : 'De pagina die je zoekt bestaat niet of is verplaatst.'}
              </p>
              <button
                onClick={() => navigate('home')}
                className="px-6 py-3 bg-amber-500 hover:bg-amber-400 rounded-lg font-semibold text-black transition-colors"
              >
                {language === 'tr' ? 'Ana Sayfaya Dön' : language === 'fr' ? 'Retour à l\'accueil' : language === 'de' ? 'Zurück zur Startseite' : 'Terug naar home'}
              </button>
            </div>
          </div>
        );
    }
  };

  const pageFallback = (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
    </div>
  );

  if (showSplash) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  if (!language) {
    return <LanguageSelector onSelectLanguage={setLanguage} />;
  }

  const page = currentPage.split('?')[0].replace(/^\/+/, '');
  const isAdminPage = ['superadmin', 'admin', 'dashboard', 'scanner', 'login', 'superadmin-reset', 'superadmin-reset.html', 'seat-picker', 'seat-checkout', 'seat-confirmation'].includes(page);

  if (isAdminPage) {
    return (
      <>
        <Suspense fallback={pageFallback}>
          {renderPage()}
        </Suspense>
        <CookieBanner />
      </>
    );
  }

  return (
    <>
      <JsonLd page={page} />
      <Layout currentPage={currentPage} onNavigate={navigate}>
        <Suspense fallback={pageFallback}>
          {renderPage()}
        </Suspense>
      </Layout>
      <ChatAssistant />
      <CookieBanner />
    </>
  );
}

export default App;
