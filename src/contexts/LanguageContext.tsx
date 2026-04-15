import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Language, getTranslation } from '../lib/translations';

interface LanguageContextType {
  language: Language | null;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LANGUAGE_STORAGE_KEY = 'preferredLanguage';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language | null>(() => {
    if (typeof window !== 'undefined' && window.__PRERENDER_INJECTED?.isPrerendering) {
      return 'nl';
    }
    // Check localStorage first, default to 'nl' (Dutch)
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (stored && (stored === 'nl' || stored === 'tr' || stored === 'fr' || stored === 'de' || stored === 'en')) {
        return stored as Language;
      }
    }
    return 'nl';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  };

  const t = (key: string) => {
    if (!language) return key;
    return getTranslation(language, key);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
