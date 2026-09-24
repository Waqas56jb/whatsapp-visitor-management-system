import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { TN } from './i18n.tn';

// English is the source language: keys are the English UI strings, TN holds the Setswana versions.
const STORAGE_KEY = 'botho_admin_lang';

const I18nContext = createContext({
  lang: 'en',
  setLang: () => {},
  t: (s) => s,
  formatDate: (value, opts) => formatDate(value, 'en', opts),
  formatDateTime: (value) => formatDateTime(value, 'en'),
});

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

// Browsers often ship without Setswana locale data, so Setswana dates are formatted here.
const TN_MONTHS = ['Ferikgong', 'Tlhakole', 'Mopitlwe', 'Moranang', 'Motsheganong', 'Seetebosigo', 'Phukwi', 'Phatwe', 'Lwetse', 'Diphalane', 'Ngwanatsele', 'Sedimonthole'];
const TN_DAYS = ['Tshipi', 'Mosupologo', 'Labobedi', 'Laboraro', 'Labone', 'Labotlhano', 'Lamatlhatso'];

function toDate(value) {
  if (!value) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value, lang, { weekday = false } = {}) {
  const d = toDate(value);
  if (!d) return value ? String(value) : '—';
  if (lang === 'tn') {
    const base = `${d.getDate()} ${TN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    return weekday ? `${TN_DAYS[d.getDay()]}, ${base}` : base;
  }
  return d.toLocaleDateString('en-GB', weekday ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(value, lang) {
  const d = toDate(value);
  if (!d) return '';
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${formatDate(d, lang)}, ${time}`;
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
    return {
      lang,
      setLang,
      t,
      formatDate: (value, opts) => formatDate(value, lang, opts),
      formatDateTime: (value) => formatDateTime(value, lang),
    };
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
