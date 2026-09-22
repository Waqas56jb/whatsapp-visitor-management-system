import { useState } from 'react';
import { CheckCircle2, QrCode, ShieldCheck, X } from 'lucide-react';
import api from '../api/client';

export default function Validator() {
  const [pin, setPin] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  async function lookupOnly() {
    const code = pin.trim();
    const qr = token.trim();
    if (!code && !qr) {
      setError('Scan the QR or enter the 6-digit PIN.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = code
        ? await api.get(`/passes/info`, { params: { pin: code } })
        : await api.get(`/passes/info/${encodeURIComponent(qr)}`);
      setResult({ mode: 'info', ...res.data });
    } catch (err) {
      setResult(null);
      setError(err.response?.data?.error || 'Pass not found');
    } finally {
      setBusy(false);
    }
  }

  async function checkIn() {
    const code = pin.trim();
    const qr = token.trim();
    if (!code && !qr) {
      setError('Scan the QR or enter the 6-digit PIN.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/passes/validate', { pin: code || undefined, token: qr || undefined });
      setResult({
        mode: 'checked',
        visitor: data.visitor?.name,
        company: data.visitor?.company,
        host: data.visit?.host,
        department: data.visit?.department,
        purpose: data.visit?.purpose,
        date: data.visit?.date,
        time: data.visit?.time,
        ref: data.visit?.ref,
        pin: data.visit?.pin,
        status: 'used',
      });
      setPin('');
      setToken('');
    } catch (err) {
      setResult(null);
      setError(err.response?.data?.error || 'Could not validate this pass');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pass-page">
      <div className="pass-card validator-card">
        <div className="pass-brand">
          <ShieldCheck size={22} /> Reception validator
        </div>
        <h1>Scan QR or enter PIN</h1>
        <p className="pass-sub">Visitor shows the WhatsApp QR. If the camera fails, use the backup PIN.</p>

        <label className="validator-field">
          <span>QR token or pass link</span>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste scanned QR / pass URL"
          />
        </label>
        <label className="validator-field">
          <span>Backup PIN</span>
          <input
            inputMode="numeric"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="6-digit PIN"
          />
        </label>

        <div className="validator-actions">
          <button className="ap-btn ap-btn-ghost" type="button" disabled={busy} onClick={lookupOnly}>
            <QrCode size={15} /> View details
          </button>
          <button className="ap-btn ap-btn-teal" type="button" disabled={busy} onClick={checkIn}>
            <CheckCircle2 size={15} /> Validate
          </button>
        </div>

        {error ? (
          <p className="pass-error" style={{ marginTop: 16 }}>
            <X size={14} /> {error}
          </p>
        ) : null}

        {result ? (
          <div className={'validator-result ' + (result.mode === 'checked' ? 'ok' : '')}>
            <b>{result.mode === 'checked' ? 'Access granted' : 'Pass details'}</b>
            <h2>{result.visitor}</h2>
            <p>{result.company}</p>
            <dl>
              <div>
                <dt>Host</dt>
                <dd>
                  {result.host}
                  {result.department ? ` · ${result.department}` : ''}
                </dd>
              </div>
              <div>
                <dt>When</dt>
                <dd>
                  {result.date} · {result.time}
                </dd>
              </div>
              <div>
                <dt>Purpose</dt>
                <dd>{result.purpose}</dd>
              </div>
              <div>
                <dt>Reference</dt>
                <dd>{result.ref}</dd>
              </div>
              {result.pin ? (
                <div>
                  <dt>PIN</dt>
                  <dd>{result.pin}</dd>
                </div>
              ) : null}
              <div>
                <dt>Status</dt>
                <dd>{result.status}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </div>
    </div>
  );
}
