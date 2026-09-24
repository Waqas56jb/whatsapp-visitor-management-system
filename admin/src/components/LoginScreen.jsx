import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Loader2, Lock, QrCode, ShieldCheck, Sparkles, User, Users } from 'lucide-react';
import { toast } from 'react-toastify';
import ScreenLoader from './ScreenLoader';
import api, { setAdminToken } from '../api/client';
import { LanguageSwitch, useI18n } from '../i18n';

function BrandMark() {
  return (
    <svg className="auth-logo" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="lg1" x1="0" y1="0" x2="40" y2="40">
          <stop offset="0%" stopColor="#8B6BFF" />
          <stop offset="100%" stopColor="#22E8C8" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#lg1)" />
      <path d="M12 20a8 8 0 1 1 3.2 6.4L11 28l1.4-4.2A8 8 0 0 1 12 20Z" stroke="#0D0822" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M17 19.5l2 2 4-4.2" stroke="#0D0822" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export default function LoginScreen({ hidden, onSuccess }) {
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const userRef = useRef(null);

  useEffect(() => {
    if (!hidden && userRef.current) userRef.current.focus();
  }, [hidden]);

  async function doAdminLogin(e) {
    e?.preventDefault();
    const u = username.trim();
    if (!u || !password) {
      toast.error(t('Enter your username and password.'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/admin/login', { username: u, password });
      setAdminToken(data.token);
      sessionStorage.setItem('botho_admin_in', '1');
      toast.success(t('Welcome back'));
      onSuccess();
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        (err.request && !err.response ? t('Cannot reach the server. Check your connection.') : t('Incorrect username or password.'));
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div id="loginScreen" className={hidden ? 'is-hidden' : ''} aria-hidden={hidden}>
      <ScreenLoader show={loading} label={t('Signing in…')} />
      <div className="auth-orb auth-orb-a" />
      <div className="auth-orb auth-orb-b" />
      <div className="auth-topbar">
        <span />
        <LanguageSwitch className="lang-switch-dark" />
      </div>
      <div className="auth-shell">
        <aside className="auth-brand">
          <div className="auth-brand-top">
            <BrandMark />
            <span>Botho Innovations</span>
          </div>
          <h2>
            {t('Secure visitor access,')}
            <em> {t('fully under control.')}</em>
          </h2>
          <p>{t('Manage accounts, hosts, visits, and every gate event from one admin panel.')}</p>
          <ul className="auth-points">
            <li>
              <ShieldCheck size={18} strokeWidth={2} /> {t('Accounts and roles')}
            </li>
            <li>
              <QrCode size={18} strokeWidth={2} /> {t('QR passes and gate checks')}
            </li>
            <li>
              <Users size={18} strokeWidth={2} /> {t('Full visitor audit trail')}
            </li>
          </ul>
        </aside>
        <div className="auth-panel">
          <form className="auth-card" onSubmit={doAdminLogin}>
            <div className="auth-card-head">
              <span className="auth-chip">
                <Sparkles size={14} strokeWidth={2.2} /> {t('Admin Panel')}
              </span>
              <h1>{t('Sign in')}</h1>
              <p>{t('Use the credentials issued for this organisation.')}</p>
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
            <button className="auth-btn violet" type="submit" disabled={loading}>
              {loading ? <Loader2 size={18} className="spin" /> : <ShieldCheck size={18} strokeWidth={2.2} />}
              {loading ? t('Signing in…') : t('Sign in')}
            </button>
            {error ? <p className="auth-error">{error}</p> : null}
            <div className="auth-demo">
              <b>{t('Test login')}</b>
              <p>
                {t('Username')}: <code>admin</code>
                <br />
                {t('Password')}: <code>admin123</code>
              </p>
              <button
                type="button"
                className="auth-demo-fill"
                onClick={() => {
                  setUsername('admin');
                  setPassword('admin123');
                  setError('');
                }}
              >
                {t('Fill test credentials')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
