import { useEffect, useRef, useState } from 'react';
import api, { setAdminToken } from '../api/client';

export default function LoginScreen({ hidden, onSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(false);
  const userRef = useRef(null);

  useEffect(() => {
    if (!hidden && userRef.current) userRef.current.focus();
  }, [hidden]);

  async function doAdminLogin() {
    const u = username.trim();
    const p = password;
    try {
      const { data } = await api.post('/auth/admin/login', { username: u, password: p });
      setAdminToken(data.token);
      sessionStorage.setItem('botho_admin_in', '1');
      setErr(false);
      onSuccess();
    } catch {
      setErr(true);
    }
  }

  return (
    <div id="loginScreen" style={hidden ? { display: 'none' } : undefined}>
      <div className="login-card">
        <svg className="login-logo" viewBox="0 0 40 40" fill="none">
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
        <h1>Botho Innovations</h1>
        <p className="sub">Admin Panel · Visitor Management System</p>
        <div className="field">
          <label>Username</label>
          <input
            id="loginUser"
            ref={userRef}
            type="text"
            placeholder="admin"
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
              if (e.key === 'Enter') doAdminLogin();
            }}
          />
        </div>
        <button className="btn-login" onClick={doAdminLogin}>
          Sign in
        </button>
        <div className="login-err" id="loginErr" style={{ display: err ? 'block' : 'none' }}>
          Incorrect username or password.
        </div>
        <div className="login-hint">
          Demo credentials — Username: <b>admin</b> &nbsp;·&nbsp; Password: <b>admin123</b>
        </div>
      </div>
    </div>
  );
}
