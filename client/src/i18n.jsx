import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { TN } from './i18n.tn';

// English is the source language: keys are the English UI strings, TN holds the Setswana versions.
const STORAGE_KEY = 'botho_client_lang';

const I18nContext = createContext({ lang: 'en', setLang: () => {}, t: (s) => s, locale: 'en-GB' });

function storageKey(user) {
  return user ? `${STORAGE_KEY}:${user}` : STORAGE_KEY;
}

function readLang(user) {
  try {
    const value = localStorage.getItem(storageKey(user)) || localStorage.getItem(STORAGE_KEY);
    return value === 'tn' ? 'tn' : 'en';
  } catch {
    return 'en';
  }
}

function interpolate(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, key) => (vars[key] === undefined || vars[key] === null ? '' : String(vars[key])));
}

export function LanguageProvider({ user, children }) {
  const [lang, setLangState] = useState(() => readLang(user));

  useEffect(() => {
    setLangState(readLang(user));
  }, [user]);

  useEffect(() => {
    document.documentElement.lang = lang === 'tn' ? 'tn' : 'en';
  }, [lang]);

  const value = useMemo(() => {
    function setLang(next) {
      const v = next === 'tn' ? 'tn' : 'en';
      try {
        localStorage.setItem(storageKey(user), v);
        localStorage.setItem(STORAGE_KEY, v);
      } catch {
        /* storage unavailable */
      }
      setLangState(v);
    }
    const t = (text, vars) => interpolate(lang === 'tn' ? TN[text] ?? text : text, vars);
    return { lang, setLang, t, locale: lang === 'tn' ? 'tn-BW' : 'en-GB' };
  }, [lang, user]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export function LanguageSwitch({ className = '' }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div className={`lang-switch ${className}`} role="group" aria-label={t('Language')}>
      <button type="button" className={lang === 'en' ? 'active' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
        English
      </button>
      <button type="button" className={lang === 'tn' ? 'active' : ''} aria-pressed={lang === 'tn'} onClick={() => setLang('tn')}>
        Setswana
      </button>
    </div>
  );
}
