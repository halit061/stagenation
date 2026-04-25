import { useState, useEffect } from 'react';
import { Cookie, X, Settings } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { txt } from '../lib/translations';
import { grantConsent, revokeConsent, track } from '../lib/fbPixel';

interface CookiePreferences {
  necessary: boolean;
  preferences: boolean;
  analytics: boolean;
}

export function CookieBanner() {
  const { language } = useLanguage();
  const [showBanner, setShowBanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>({
    necessary: true,
    preferences: false,
    analytics: false,
  });

  useEffect(() => {
    const consent = localStorage.getItem('cookie_consent');
    if (!consent) {
      setShowBanner(true);
    }
  }, []);

  const savePreferences = (prefs: CookiePreferences) => {
    const consentData = {
      ...prefs,
      timestamp: new Date().toISOString(),
      version: '1.0',
    };

    localStorage.setItem('cookie_consent', JSON.stringify(consentData));
    setShowBanner(false);
    setShowSettings(false);

    if (prefs.analytics) {
      grantConsent();
      track('PageView');
    } else {
      revokeConsent();
    }
  };

  const acceptAll = () => {
    savePreferences({
      necessary: true,
      preferences: true,
      analytics: true,
    });
  };

  const acceptNecessary = () => {
    savePreferences({
      necessary: true,
      preferences: false,
      analytics: false,
    });
  };

  const saveCustomPreferences = () => {
    savePreferences(preferences);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 pointer-events-none">
      <div className="pointer-events-auto w-[340px] sm:w-[370px]">
        <div className="bg-slate-900/95 backdrop-blur-md border border-cyan-500/20 rounded-xl shadow-lg shadow-cyan-500/10 overflow-hidden">
          {!showSettings ? (
            <div className="p-2.5">
              <div className="flex items-start gap-2 mb-2">
                <div className="p-1.5 bg-cyan-500/10 rounded-md shrink-0 mt-0.5">
                  <Cookie className="w-3.5 h-3.5 text-cyan-400" />
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-[13px] font-bold text-white leading-tight mb-0.5">
                    {txt(language, {
                      nl: 'Cookie Voorkeuren',
                      tr: 'Çerez Tercihleri',
                      fr: 'Préférences de cookies',
                      de: 'Cookie-Einstellungen',
                    })}
                  </h3>

                  <p className="text-[11px] text-slate-300 leading-4">
                    {txt(language, {
                      nl: 'Wij gebruiken cookies om de website goed te laten werken en je ervaring te verbeteren.',
                      tr: 'Web sitesinin düzgün çalışması ve deneyiminizi iyileştirmek için çerezler kullanıyoruz.',
                      fr: 'Nous utilisons des cookies pour assurer le bon fonctionnement du site et améliorer votre expérience.',
                      de: 'Wir verwenden Cookies, damit die Website korrekt funktioniert und um Ihre Erfahrung zu verbessern.',
                    })}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5 mb-2">
                <button
                  onClick={acceptAll}
                  className="py-1.5 px-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white text-[11px] font-semibold rounded-md transition-all"
                >
                  {txt(language, {
                    nl: 'Alles',
                    tr: 'Hepsi',
                    fr: 'Tout',
                    de: 'Alle',
                  })}
                </button>

                <button
                  onClick={acceptNecessary}
                  className="py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-medium rounded-md transition-all"
                >
                  {txt(language, {
                    nl: 'Nodig',
                    tr: 'Gerekli',
                    fr: 'Nécessaires',
                    de: 'Nur nötig',
                  })}
                </button>

                <button
                  onClick={() => setShowSettings(true)}
                  className="py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium rounded-md transition-all border border-slate-700"
                >
                  <Settings className="w-3 h-3 inline mr-1" />
                  {txt(language, {
                    nl: 'Aanpassen',
                    tr: 'Ayarla',
                    fr: 'Options',
                    de: 'Anpassen',
                  })}
                </button>
              </div>

              <p className="text-[10px] text-slate-500 leading-3">
                {txt(language, {
                  nl: 'Meer info in ons',
                  tr: 'Daha fazla bilgi için',
                  fr: 'Plus d’infos dans notre',
                  de: 'Mehr Infos in unserer',
                })}{' '}
                <button
                  className="text-cyan-400 hover:underline"
                  onClick={() => {
                    window.history.pushState({}, '', '/privacy');
                    window.dispatchEvent(new PopStateEvent('popstate'));
                  }}
                >
                  {txt(language, {
                    nl: 'privacybeleid',
                    tr: 'gizlilik politikası',
                    fr: 'politique de confidentialité',
                    de: 'Datenschutzrichtlinie',
                  })}
                </button>
              </p>
            </div>
          ) : (
            <div className="p-2.5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[13px] font-bold text-white">
                  {txt(language, {
                    nl: 'Cookie Instellingen',
                    tr: 'Çerez Ayarları',
                    fr: 'Paramètres des cookies',
                    de: 'Cookie-Einstellungen',
                  })}
                </h3>

                <button
                  onClick={() => setShowSettings(false)}
                  className="p-1 hover:bg-slate-700 rounded-md transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>

              <div className="space-y-2 mb-2">
                <div className="bg-slate-800/60 rounded-md p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[12px] font-semibold text-white">
                        {txt(language, {
                          nl: 'Strikt noodzakelijk',
                          tr: 'Kesinlikle gerekli',
                          fr: 'Strictement nécessaire',
                          de: 'Unbedingt erforderlich',
                        })}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-3.5">
                        {txt(language, {
                          nl: 'Altijd actief voor basisfuncties.',
                          tr: 'Temel işlevler için her zaman aktif.',
                          fr: 'Toujours actif pour les fonctions de base.',
                          de: 'Immer aktiv für die Grundfunktionen.',
                        })}
                      </p>
                    </div>

                    <span className="text-[9px] text-green-400 font-semibold whitespace-nowrap">
                      {txt(language, {
                        nl: 'AAN',
                        tr: 'AÇIK',
                        fr: 'ACTIF',
                        de: 'AKTIV',
                      })}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-800/60 rounded-md p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="pr-2">
                      <p className="text-[12px] font-semibold text-white">
                        {txt(language, {
                          nl: 'Voorkeuren',
                          tr: 'Tercihler',
                          fr: 'Préférences',
                          de: 'Einstellungen',
                        })}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-3.5">
                        {txt(language, {
                          nl: 'Taal en voorkeuren onthouden.',
                          tr: 'Dil ve tercihleri hatırlar.',
                          fr: 'Mémorise la langue et les préférences.',
                          de: 'Speichert Sprache und Einstellungen.',
                        })}
                      </p>
                    </div>

                    <button
                      onClick={() =>
                        setPreferences((prev) => ({
                          ...prev,
                          preferences: !prev.preferences,
                        }))
                      }
                      className="relative shrink-0"
                    >
                      <div
                        className={`w-10 h-5 rounded-full transition-colors ${
                          preferences.preferences ? 'bg-cyan-500' : 'bg-slate-700'
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                            preferences.preferences ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </div>
                    </button>
                  </div>
                </div>

                <div className="bg-slate-800/60 rounded-md p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="pr-2">
                      <p className="text-[12px] font-semibold text-white">
                        {txt(language, {
                          nl: 'Analytics',
                          tr: 'Analitik',
                          fr: 'Analytique',
                          de: 'Analytik',
                        })}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-3.5">
                        {txt(language, {
                          nl: 'Helpt ons gebruik te begrijpen.',
                          tr: 'Kullanımı anlamamıza yardımcı olur.',
                          fr: 'Nous aide à comprendre l’utilisation.',
                          de: 'Hilft uns, die Nutzung zu verstehen.',
                        })}
                      </p>
                    </div>

                    <button
                      onClick={() =>
                        setPreferences((prev) => ({
                          ...prev,
                          analytics: !prev.analytics,
                        }))
                      }
                      className="relative shrink-0"
                    >
                      <div
                        className={`w-10 h-5 rounded-full transition-colors ${
                          preferences.analytics ? 'bg-cyan-500' : 'bg-slate-700'
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                            preferences.analytics ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={saveCustomPreferences}
                  className="py-2 px-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white text-[11px] font-semibold rounded-md transition-all"
                >
                  {txt(language, {
                    nl: 'Opslaan',
                    tr: 'Kaydet',
                    fr: 'Enregistrer',
                    de: 'Speichern',
                  })}
                </button>

                <button
                  onClick={() => setShowSettings(false)}
                  className="py-2 px-2 bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-medium rounded-md transition-all"
                >
                  {txt(language, {
                    nl: 'Terug',
                    tr: 'Geri',
                    fr: 'Retour',
                    de: 'Zurück',
                  })}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}