import { useState, useEffect } from 'react';
import { Cookie, X, Check, Settings } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { txt } from '../lib/translations';

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
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-4xl">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-2 border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-500/20 overflow-hidden">
          {!showSettings ? (
            <div className="p-8">
              <div className="flex items-start gap-4 mb-6">
                <div className="p-3 bg-cyan-500/10 rounded-xl">
                  <Cookie className="w-8 h-8 text-cyan-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-white mb-2">
                    {txt(language, { nl: 'Cookie Voorkeuren', tr: 'Çerez Tercihleri', fr: 'Préférences de cookies', de: 'Cookie-Einstellungen' })}
                  </h3>
                  <p className="text-slate-300 leading-relaxed">
                    {txt(language, { nl: 'Wij gebruiken cookies om je ervaring te verbeteren, voorkeuren te onthouden en onze diensten te optimaliseren. Strikt noodzakelijke cookies zijn altijd actief voor de basisfunctionaliteit van de website.', tr: 'Deneyiminizi geliştirmek, tercihlerinizi hatırlamak ve hizmetlerimizi optimize etmek için çerezler kullanıyoruz. Web sitesinin temel işlevselliği için kesinlikle gerekli çerezler her zaman etkindir.', fr: 'Nous utilisons des cookies pour améliorer votre expérience, mémoriser vos préférences et optimiser nos services. Les cookies strictement nécessaires sont toujours actifs pour le fonctionnement de base du site.', de: 'Wir verwenden Cookies, um Ihre Erfahrung zu verbessern, Einstellungen zu speichern und unsere Dienste zu optimieren. Unbedingt erforderliche Cookies sind für die Grundfunktionalität der Website immer aktiv.' })}
                  </p>
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-4 mb-6">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      <Check className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm mb-1">
                        {txt(language, { nl: 'Noodzakelijk', tr: 'Gerekli', fr: 'Nécessaire', de: 'Erforderlich' })}
                      </p>
                      <p className="text-xs text-slate-400">
                        {txt(language, { nl: 'Altijd actief', tr: 'Her zaman aktif', fr: 'Toujours actif', de: 'Immer aktiv' })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      <Cookie className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm mb-1">
                        {txt(language, { nl: 'Voorkeuren', tr: 'Tercihler', fr: 'Préférences', de: 'Einstellungen' })}
                      </p>
                      <p className="text-xs text-slate-400">
                        {txt(language, { nl: 'Taal, thema', tr: 'Dil, tema', fr: 'Langue, thème', de: 'Sprache, Design' })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      <Settings className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm mb-1">
                        {txt(language, { nl: 'Analytics', tr: 'Analitik', fr: 'Analytique', de: 'Analytik' })}
                      </p>
                      <p className="text-xs text-slate-400">
                        {txt(language, { nl: 'Gebruik meten', tr: 'Kullanım ölçümü', fr: 'Mesurer l\'utilisation', de: 'Nutzung messen' })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={acceptAll}
                  className="flex-1 py-3 px-6 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-bold rounded-lg transition-all shadow-lg shadow-cyan-500/30"
                >
                  {txt(language, { nl: 'Alles Accepteren', tr: 'Hepsini Kabul Et', fr: 'Tout accepter', de: 'Alle akzeptieren' })}
                </button>
                <button
                  onClick={acceptNecessary}
                  className="flex-1 py-3 px-6 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-all"
                >
                  {txt(language, { nl: 'Alleen Noodzakelijk', tr: 'Sadece Gerekli', fr: 'Nécessaires uniquement', de: 'Nur erforderliche' })}
                </button>
                <button
                  onClick={() => setShowSettings(true)}
                  className="py-3 px-6 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg transition-all border border-slate-700"
                >
                  <Settings className="w-5 h-5 inline mr-2" />
                  {txt(language, { nl: 'Aanpassen', tr: 'Özelleştir', fr: 'Personnaliser', de: 'Anpassen' })}
                </button>
              </div>

              <p className="text-xs text-slate-500 mt-4 text-center">
                {txt(language, { nl: 'Door deze website te gebruiken, ga je akkoord met ons gebruik van cookies zoals beschreven in onze', tr: 'Bu web sitesini kullanarak, çerez kullanımımızı kabul etmiş olursunuz', fr: 'En utilisant ce site, vous acceptez notre utilisation des cookies comme décrit dans notre', de: 'Durch die Nutzung dieser Website stimmen Sie unserer Verwendung von Cookies zu, wie in unserer beschrieben' })}
                {' '}
                <button className="text-cyan-400 hover:underline" onClick={() => { window.history.pushState({}, '', '/privacy'); window.dispatchEvent(new PopStateEvent('popstate')); }}>
                  {txt(language, { nl: 'Privacybeleid', tr: 'Gizlilik Politikası', fr: 'Politique de confidentialité', de: 'Datenschutzrichtlinie' })}
                </button>
              </p>
            </div>
          ) : (
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-white">
                  {txt(language, { nl: 'Cookie Instellingen', tr: 'Çerez Ayarları', fr: 'Paramètres des cookies', de: 'Cookie-Einstellungen' })}
                </h3>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="space-y-4 mb-6">
                <div className="bg-slate-800/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-white font-semibold">
                        {txt(language, { nl: 'Strikt Noodzakelijk', tr: 'Kesinlikle Gerekli', fr: 'Strictement nécessaire', de: 'Unbedingt erforderlich' })}
                      </p>
                      <p className="text-sm text-slate-400">
                        {txt(language, { nl: 'Vereist voor basisfunctionaliteit van de website', tr: 'Web sitesinin temel işlevselliği için gerekli', fr: 'Requis pour le fonctionnement de base du site', de: 'Erforderlich für die Grundfunktionalität der Website' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-green-400 font-semibold">
                        {txt(language, { nl: 'ALTIJD AAN', tr: 'HER ZAMAN AÇIK', fr: 'TOUJOURS ACTIF', de: 'IMMER AKTIV' })}
                      </span>
                      <div className="w-12 h-6 bg-green-500 rounded-full flex items-center justify-end px-1">
                        <div className="w-4 h-4 bg-white rounded-full" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-800/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-white font-semibold">
                        {txt(language, { nl: 'Voorkeuren', tr: 'Tercihler', fr: 'Préférences', de: 'Einstellungen' })}
                      </p>
                      <p className="text-sm text-slate-400">
                        {txt(language, { nl: 'Onthoudt taalinstellingen en andere voorkeuren', tr: 'Dil ayarlarını ve diğer tercihleri hatırlar', fr: 'Mémorise les paramètres de langue et autres préférences', de: 'Speichert Spracheinstellungen und andere Präferenzen' })}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        setPreferences((prev) => ({ ...prev, preferences: !prev.preferences }))
                      }
                      className="relative"
                    >
                      <div
                        className={`w-12 h-6 rounded-full transition-colors ${
                          preferences.preferences ? 'bg-cyan-500' : 'bg-slate-700'
                        }`}
                      >
                        <div
                          className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                            preferences.preferences ? 'translate-x-7' : 'translate-x-1'
                          }`}
                        />
                      </div>
                    </button>
                  </div>
                </div>

                <div className="bg-slate-800/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-white font-semibold">
                        {txt(language, { nl: 'Analytics', tr: 'Analitik', fr: 'Analytique', de: 'Analytik' })}
                      </p>
                      <p className="text-sm text-slate-400">
                        {txt(language, { nl: 'Helpt ons te begrijpen hoe bezoekers de website gebruiken', tr: 'Ziyaretçilerin web sitesini nasıl kullandığını anlamamıza yardımcı olur', fr: 'Nous aide à comprendre comment les visiteurs utilisent le site', de: 'Hilft uns zu verstehen, wie Besucher die Website nutzen' })}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        setPreferences((prev) => ({ ...prev, analytics: !prev.analytics }))
                      }
                      className="relative"
                    >
                      <div
                        className={`w-12 h-6 rounded-full transition-colors ${
                          preferences.analytics ? 'bg-cyan-500' : 'bg-slate-700'
                        }`}
                      >
                        <div
                          className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                            preferences.analytics ? 'translate-x-7' : 'translate-x-1'
                          }`}
                        />
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={saveCustomPreferences}
                  className="flex-1 py-3 px-6 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-bold rounded-lg transition-all"
                >
                  {txt(language, { nl: 'Voorkeuren Opslaan', tr: 'Tercihleri Kaydet', fr: 'Enregistrer les préférences', de: 'Einstellungen speichern' })}
                </button>
                <button
                  onClick={() => setShowSettings(false)}
                  className="py-3 px-6 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-all"
                >
                  {txt(language, { nl: 'Annuleren', tr: 'İptal', fr: 'Annuler', de: 'Abbrechen' })}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
