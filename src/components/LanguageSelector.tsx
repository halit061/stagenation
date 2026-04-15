import { Language } from '../lib/translations';

interface LanguageSelectorProps {
  onSelectLanguage: (lang: Language) => void;
}

export function LanguageSelector({ onSelectLanguage }: LanguageSelectorProps) {
  const languages = [
    { code: 'nl' as Language, name: 'Nederlands', flag: '🇳🇱' },
    { code: 'fr' as Language, name: 'Français', flag: '🇫🇷' },
    { code: 'en' as Language, name: 'English', flag: '🇬🇧' },
    { code: 'de' as Language, name: 'Deutsch', flag: '🇩🇪' },
    { code: 'tr' as Language, name: 'Türkçe', flag: '🇹🇷' },
  ];

  return (
    <div className="fixed inset-0 bg-black z-50 flex items-center justify-center p-4 overflow-y-auto">
      {/* Ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-sm my-auto">
        {/* Logo */}
        <div className="flex items-center justify-center mb-6">
          <span className="text-amber-400 font-black text-3xl tracking-widest uppercase" style={{ letterSpacing: '0.12em' }}>
            STAGENATION
          </span>
        </div>

        <h2 className="text-xl font-bold text-white text-center mb-1">
          Kies je taal
        </h2>
        <p className="text-slate-500 text-sm text-center mb-6">
          Choose your language
        </p>

        <div className="space-y-3">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => onSelectLanguage(lang.code)}
              className="w-full flex items-center gap-4 p-4 bg-white/5 hover:bg-amber-500/10 rounded-xl transition-all duration-200 group border border-white/10 hover:border-amber-500/30"
            >
              <span className="text-2xl">{lang.flag}</span>
              <span className="text-base font-semibold text-white group-hover:text-amber-400 transition-colors">
                {lang.name}
              </span>
            </button>
          ))}
        </div>

        <p className="text-slate-600 text-xs text-center mt-8">
          Je kunt de taal later wijzigen
        </p>
      </div>
    </div>
  );
}
