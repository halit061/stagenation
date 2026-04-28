import { MapPin, Car, Brain as Train, Info, AlertCircle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useDocumentHead } from '../hooks/useDocumentHead';

export function Location() {
  const { t } = useLanguage();
  useDocumentHead({
    title: 'Locatie & Bereikbaarheid',
    description: 'Vind de locatie van StageNation. Routebeschrijving met auto, trein en openbaar vervoer.',
    path: '/location',
  });

  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  const zoom = 16.18;

  const hasValidApiKey = !!googleMapsApiKey;

  return (
    <div className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="text-cyan-400">{t('location.title')}</span> {t('location.subtitle')}
          </h1>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            {t('location.subtitleDesc')}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-8">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 bg-cyan-500/10 rounded-lg flex items-center justify-center">
                <MapPin className="w-5 h-5 text-cyan-400" />
              </div>
              <h2 className="text-2xl font-bold">{t('location.address')}</h2>
            </div>

            <div className="space-y-4 text-slate-300">
              <div>
                <h3 className="font-semibold text-white mb-1">Limburghal</h3>
                <p>Jaarbeurslaan 6</p>
                <p>3600 Genk</p>
                <p>België</p>
              </div>

              <div>
                <h3 className="font-semibold text-white mb-1">{t('location.contact')}</h3>
                <p>
                  <a
                    href="mailto:info@stagenation.be"
                    className="text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    info@stagenation.be
                  </a>
                </p>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-8">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 bg-cyan-500/10 rounded-lg flex items-center justify-center">
                <Car className="w-5 h-5 text-cyan-400" />
              </div>
              <h2 className="text-2xl font-bold">{t('location.byCar')}</h2>
            </div>

            <div className="space-y-4 text-slate-300">
              <div>
                <h3 className="font-semibold text-white mb-2">{t('location.fromHasselt')}</h3>
                <p className="text-sm">{t('location.fromHasseltDesc')}</p>
              </div>

              <div>
                <h3 className="font-semibold text-white mb-2">{t('location.fromGenk')}</h3>
                <p className="text-sm">{t('location.fromGenkDesc')}</p>
              </div>

              <div>
                <h3 className="font-semibold text-white mb-2">{t('location.parking')}</h3>
                <p className="text-sm">{t('location.parkingDesc')}</p>
                <p className="text-sm">{t('location.parkingSpaces')}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-8 mb-12">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 bg-cyan-500/10 rounded-lg flex items-center justify-center">
              <Train className="w-5 h-5 text-cyan-400" />
            </div>
            <h2 className="text-2xl font-bold">{t('location.publicTransport')}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-slate-300">
            <div>
              <h3 className="font-semibold text-white mb-2">{t('location.train')}</h3>
              <p className="text-sm mb-2">{t('location.trainDesc')}</p>
              <p className="text-sm">{t('location.trainTaxi')}</p>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-2">{t('location.bus')}</h3>
              <p className="text-sm mb-2">{t('location.busDesc')}</p>
              <p className="text-sm">{t('location.busDirect')}</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl overflow-hidden">
          <div className="p-8 pb-0">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 bg-cyan-500/10 rounded-lg flex items-center justify-center">
                <Info className="w-5 h-5 text-cyan-400" />
              </div>
              <h2 className="text-2xl font-bold">{t('location.map')}</h2>
            </div>
          </div>

          <div className="aspect-video w-full bg-slate-900 border-t border-slate-700 relative">
            {hasValidApiKey ? (
              <iframe
                src={`https://www.google.com/maps/embed/v1/place?key=${googleMapsApiKey}&q=Limburg+Hal,Jaarbeurslaan+6,Genk&zoom=${zoom}`}
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="absolute inset-0"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
                <AlertCircle className="w-16 h-16 text-yellow-500 mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">Google Maps API Key Required</h3>
                <p className="text-slate-400 mb-4 max-w-md">
                  To display the interactive map, please add your Google Maps API key to the .env file.
                </p>
                <div className="bg-slate-800 rounded-lg p-4 max-w-2xl">
                  <p className="text-sm text-slate-300 mb-2 font-mono">
                    VITE_GOOGLE_MAPS_API_KEY=your_api_key_here
                  </p>
                  <p className="text-xs text-slate-500">
                    Get your API key at: console.cloud.google.com/google/maps-apis
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-slate-700 text-center">
            <a
              href="https://www.google.com/maps/search/?api=1&query=Limburghal,Jaarbeurslaan+6,Genk,Belgium"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium transition-colors"
            >
              <MapPin className="w-5 h-5" />
              Open in Google Maps
            </a>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-xl p-6 text-center">
            <div className="text-3xl font-bold text-cyan-400 mb-2">15 min</div>
            <div className="text-sm text-slate-400">{t('location.fromCity')}</div>
          </div>

          <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-xl p-6 text-center">
            <div className="text-3xl font-bold text-cyan-400 mb-2">500+</div>
            <div className="text-sm text-slate-400">{t('location.parkingSpacesStat')}</div>
          </div>

          <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-xl p-6 text-center">
            <div className="text-3xl font-bold text-cyan-400 mb-2">24/7</div>
            <div className="text-sm text-slate-400">{t('location.highway')}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
