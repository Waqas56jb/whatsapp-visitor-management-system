import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import api, { setClientToken } from '../api/client';

export default function LoginScreen({ on, onClose, onSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const userRef = useRef(null);

  useEffect(() => {
    if (on && userRef.current) userRef.current.focus();
    if (!on) setErr('');
  }, [on]);

  async function doClientLogin() {
    const u = username.trim();
    const p = password;
    try {
      const { data } = await api.post('/auth/client/login', { username: u, password: p });
      const acc = data.host;
      setClientToken(data.token);
      sessionStorage.setItem('botho_client_user', JSON.stringify(acc));
      setErr('');
      onSuccess(acc);
    } catch (err) {
      const msg = err.response?.data?.error;
      if (err.response?.status === 403) {
        setErr(msg || 'This account has been disabled. Contact your administrator.');
      } else {
        setErr(msg || 'Incorrect username or password.');
      }
    }
  }

  return (
    <div id="loginScreen" className={on ? 'on' : ''}>
      <button className="login-close" onClick={onClose}>
        <ArrowLeft size={15} strokeWidth={2.2} /> Back to site
      </button>
      <div className="login-card">
        <svg className="login-logo" viewBox="0 0 40 40" fill="none">
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
        <h1>Client Portal</h1>
        <p className="sub">Botho Innovations · Visitor Management System</p>
        <div className="field">
          <label>Username</label>
          <input
            id="loginUser"
            ref={userRef}
            type="text"
            placeholder="Your username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            id="loginPass"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') doClientLogin();
            }}
          />
        </div>
        <button className="btn-login" onClick={doClientLogin}>
          Sign in
        </button>
        <div className="login-err" id="loginErr" style={{ display: err ? 'block' : 'none' }}>
          {err || 'Incorrect username or password.'}
        </div>
        <div className="login-hint">
          Demo login — Username: <b>boikarabelo</b> &nbsp;·&nbsp; Password: <b>host2026</b>
          <br />
          New accounts are created by your administrator in the Admin Panel.
        </div>
        <p className="no-account">Don't have a login? Ask your administrator to create one for you.</p>
      </div>
    </div>
  );
}
