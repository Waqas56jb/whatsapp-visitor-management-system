import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ClipboardList, Eye, EyeOff, Loader2, Lock, QrCode, ShieldCheck, Sparkles, User } from 'lucide-react';
import { toast } from 'react-toastify';
import ScreenLoader from './ScreenLoader';
import api, { setClientToken } from '../api/client';
import { LanguageSwitch, useI18n } from '../i18n';

function BrandMark() {
  return (
    <svg className="auth-logo" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="lg2" x1="0" y1="0" x2="40" y2="40">
          <stop offset="0%" stopColor="#22E8C8" />
          <stop offset="100%" stopColor="#8B6BFF" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#lg2)" />
      <path d="M12 20a8 8 0 1 1 3.2 6.4L11 28l1.4-4.2A8 8 0 0 1 12 20Z" stroke="#0D0822" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M17 19.5l2 2 4-4.2" stroke="#0D0822" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export default function LoginScreen({ on, onClose, onSuccess }) {
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const userRef = useRef(null);

  useEffect(() => {
    if (on && userRef.current) userRef.current.focus();
  }, [on]);

  async function doClientLogin(e) {
    e?.preventDefault();
    const u = username.trim();
    if (!u || !password) {
      toast.error(t('Enter your username and password.'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/client/login', { username: u, password });
      const acc = data.host;
      setClientToken(data.token);
      sessionStorage.setItem('botho_client_user', JSON.stringify(acc));
      toast.success(t('Welcome, {name}', { name: acc.name.split(' ')[0] }));
      onSuccess(acc);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        (err.request && !err.response ? t('Cannot reach the server. Check your connection.') : t('Incorrect username or password.'));
      setError(msg);
      toast.error(err.response?.status === 403 ? msg || t('This account has been disabled. Contact your administrator.') : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div id="loginScreen" className={on ? 'on' : ''} aria-hidden={!on}>
      <ScreenLoader show={loading} label={t('Signing in…')} />
      <div className="auth-orb auth-orb-a" />
      <div className="auth-orb auth-orb-b" />
      <div className="auth-topbar">
        <button className="auth-back" onClick={onClose} type="button">
          <ArrowLeft size={16} strokeWidth={2.2} /> {t('Back to site')}
        </button>
        <LanguageSwitch className="lang-switch-dark" />
      </div>
      <div className="auth-shell">
        <aside className="auth-brand teal">
          <div className="auth-brand-top">
            <BrandMark />
            <span>Botho Innovations</span>
          </div>
          <h2>
            {t('Visitor management,')}
            <em> {t('without the paperwork.')}</em>
          </h2>
          <p>{t('Review WhatsApp visit requests, issue QR passes, and keep a clean record of everyone who visits.')}</p>
          <ul className="auth-points">
            <li>
              <ClipboardList size={18} strokeWidth={2} /> {t('Every company visit request in one place')}
            </li>
            <li>
              <QrCode size={18} strokeWidth={2} /> {t('Instant QR passes on WhatsApp')}
            </li>
            <li>
              <ShieldCheck size={18} strokeWidth={2} /> {t('Secure, auditable decisions')}
            </li>
          </ul>
        </aside>
        <div className="auth-panel">
          <form className="auth-card" onSubmit={doClientLogin}>
            <div className="auth-card-head">
              <span className="auth-chip teal">
                <Sparkles size={14} strokeWidth={2.2} /> {t('Client Portal')}
              </span>
              <h1>{t('Sign in')}</h1>
              <p>{t('Accounts are issued by your administrator.')}</p>
            </div>
            <label className="auth-field">
              <span>{t('Username')}</span>
              <div className="auth-input">
                <User size={18} strokeWidth={1.9} />
                <input
                  ref={userRef}
                  type="text"
                  placeholder={t('Enter username')}
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </label>
            <label className="auth-field">
              <span>{t('Password')}</span>
              <div className="auth-input">
                <Lock size={18} strokeWidth={1.9} />
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder={t('Enter password')}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="auth-eye"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? t('Hide password') : t('Show password')}
                >
                  {showPass ? <EyeOff size={18} strokeWidth={1.9} /> : <Eye size={18} strokeWidth={1.9} />}
                </button>
              </div>
            </label>
            <button className="auth-btn teal" type="submit" disabled={loading}>
              {loading ? <Loader2 size={18} className="spin" /> : <ShieldCheck size={18} strokeWidth={2.2} />}
              {loading ? t('Signing in…') : t('Sign in')}
            </button>
            {error ? <p className="auth-error">{error}</p> : null}
            <div className="auth-demo">
              <b>{t('Test login')}</b>
              <p>
                {t('Username')}: <code>boikarabelo</code>
                <br />
                {t('Password')}: <code>host2026</code>
              </p>
              <button
                type="button"
                className="auth-demo-fill"
                onClick={() => {
                  setUsername('boikarabelo');
                  setPassword('host2026');
                  setError('');
                }}
              >
                {t('Fill test credentials')}
              </button>
            </div>
            <p className="auth-foot">{t('Need access? Ask your administrator to create an account.')}</p>
          </form>
        </div>
      </div>
    </div>
  );
}
