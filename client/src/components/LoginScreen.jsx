import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Building2, Eye, EyeOff, Loader2, Lock, QrCode, ShieldCheck, Sparkles, User } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { setClientToken } from '../api/client';

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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const userRef = useRef(null);

  useEffect(() => {
    if (on && userRef.current) userRef.current.focus();
  }, [on]);

  async function doClientLogin(e) {
    e?.preventDefault();
    const u = username.trim();
    const p = password;
    if (!u || !p) {
      toast.error('Enter your username and password.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/client/login', { username: u, password: p });
      const acc = data.host;
      setClientToken(data.token);
      sessionStorage.setItem('botho_client_user', JSON.stringify(acc));
      toast.success(`Welcome, ${acc.name.split(' ')[0]}`);
      onSuccess(acc);
    } catch (err) {
      const msg = err.response?.data?.error;
      if (err.response?.status === 403) {
        toast.error(msg || 'This account has been disabled. Contact your administrator.');
      } else {
        toast.error(msg || 'Incorrect username or password.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div id="loginScreen" className={on ? 'on' : ''} aria-hidden={!on}>
      <div className="auth-orb auth-orb-a" />
      <div className="auth-orb auth-orb-b" />
      <button className="auth-back" onClick={onClose} type="button">
        <ArrowLeft size={16} strokeWidth={2.2} /> Back to site
      </button>
      <div className="auth-shell">
        <aside className="auth-brand teal">
          <div className="auth-brand-top">
            <BrandMark />
            <span>Botho Innovations</span>
          </div>
          <h2>
            Host visitors
            <em> without the lobby chaos.</em>
          </h2>
          <p>Approve requests, share QR passes, and keep a clean history of everyone who came to see you.</p>
          <ul className="auth-points">
            <li>
              <Building2 size={18} strokeWidth={2} /> Your department only
            </li>
            <li>
              <QrCode size={18} strokeWidth={2} /> Instant visitor passes
            </li>
            <li>
              <ShieldCheck size={18} strokeWidth={2} /> Secure, auditable decisions
            </li>
          </ul>
        </aside>
        <div className="auth-panel">
          <form className="auth-card" onSubmit={doClientLogin}>
            <div className="auth-card-head">
              <span className="auth-chip teal">
                <Sparkles size={14} strokeWidth={2.2} /> Host portal
              </span>
              <h1>Sign in</h1>
              <p>Accounts are issued by your administrator.</p>
            </div>
            <label className="auth-field">
              <span>Username</span>
              <div className="auth-input">
                <User size={18} strokeWidth={1.9} />
                <input
                  ref={userRef}
                  type="text"
                  placeholder="Enter username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </label>
            <label className="auth-field">
              <span>Password</span>
              <div className="auth-input">
                <Lock size={18} strokeWidth={1.9} />
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" className="auth-eye" onClick={() => setShowPass((v) => !v)} aria-label={showPass ? 'Hide password' : 'Show password'}>
                  {showPass ? <EyeOff size={18} strokeWidth={1.9} /> : <Eye size={18} strokeWidth={1.9} />}
                </button>
              </div>
            </label>
            <button className="auth-btn teal" type="submit" disabled={loading}>
              {loading ? <Loader2 size={18} className="spin" /> : <ShieldCheck size={18} strokeWidth={2.2} />}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
            <p className="auth-foot">Need access? Ask your administrator to create a host account.</p>
          </form>
        </div>
      </div>
    </div>
  );
}
