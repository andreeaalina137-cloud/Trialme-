import React, { createContext, useContext, useState, useEffect } from 'react';
import type { SupportedLanguage } from '../types/subscription';
import { TRANSLATIONS, SUPPORTED_LANGUAGES } from './translations';
import type { LanguageInfo } from './translations';
import { safeStorageGet, safeStorageSet } from '../utils/storage';

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  languages: LanguageInfo[];
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    const saved = safeStorageGet('subcleaner_language') as SupportedLanguage | null;
    if (saved && TRANSLATIONS[saved]) {
      return saved;
    }
    return 'en-GB'; // British English is default
  });

  const setLanguage = (lang: SupportedLanguage) => {
    setLanguageState(lang);
    safeStorageSet('subcleaner_language', lang);
    document.documentElement.lang = lang;
  };

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = (key: string, vars?: Record<string, string | number>): string => {
    const langDict = TRANSLATIONS[language] || TRANSLATIONS['en-GB'];
    let text = langDict[key] || TRANSLATIONS['en-GB'][key] || key;

    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      });
    }

    return text;
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        t,
        languages: SUPPORTED_LANGUAGES,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
};
