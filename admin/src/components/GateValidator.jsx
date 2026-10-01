import { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, QrCode, RefreshCw, ScanLine, X } from 'lucide-react';
import api from '../api/client';
import { useI18n } from '../i18n';

const STATUS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  used: 'Checked in',
  cancelled: 'Cancelled',
};

// Reception desk: look up or check in a pass by QR token / pass link or backup PIN, and a
// read-only list of today's visits.
export default function GateValidator({ onToast }) {
  const { t } = useI18n();
  const [pin, setPin] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [today, setToday] = useState([]);
  const [loadingToday, setLoadingToday] = useState(false);

  async function loadToday() {
    setLoadingToday(true);
    try {
      const { data } = await api.get('/visits/today');
      setToday(Array.isArray(data) ? data : []);
    } catch {
      onToast?.(t("Could not load today's visits"), true);
    } finally {
      setLoadingToday(false);
    }
  }

  useEffect(() => {
    loadToday();
  }, []);

  function codes() {
    const code = pin.trim();
    const qr = token.trim();
    if (!code && !qr) setError(t('Scan the QR or enter the 6-digit PIN.'));
    return { code, qr };
  }

  async function lookupOnly() {
    const { code, qr } = codes();
    if (!code && !qr) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await api.get('/passes/info', { params: code ? { pin: code } : { token: qr } });
      setResult({ mode: 'info', ...data });
    } catch (err) {
      setResult(null);
      setError(err.response?.data?.error || t('Pass not found'));
    } finally {
      setBusy(false);
    }
  }

  async function checkIn() {
    const { code, qr } = codes();
    if (!code && !qr) return;
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
        status: 'used',
      });
      setPin('');
      setToken('');
      loadToday();
    } catch (err) {
      setResult(null);
      setError(err.response?.data?.error || t('Could not validate this pass'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">
            <span className="panel-ic">
              <ScanLine size={16} strokeWidth={2} />
            </span>
            <div>
              <h3>{t('Scan QR or enter PIN')}</h3>
              <p>{t('Visitor shows the WhatsApp QR. If it cannot be scanned, use the backup PIN.')}</p>
            </div>
          </div>
        </div>
        <div className="form-grid">
          <div className="f-field">
            <label htmlFor="gateToken">{t('QR token or pass link')}</label>
            <input id="gateToken" value={token} onChange={(e) => setToken(e.target.value)} placeholder={t('Paste the scanned QR or pass link')} />
          </div>
          <div className="f-field">
            <label htmlFor="gatePin">{t('Backup PIN')}</label>
            <input
              id="gatePin"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder={t('6-digit PIN')}
            />
          </div>
        </div>
        {error ? (
          <p className="gate-error">
            <X size={14} /> {error}
          </p>
        ) : null}
        {result ? (
          <div className={'gate-result' + (result.mode === 'checked' ? ' ok' : '')}>
            <b>{result.mode === 'checked' ? t('Access granted') : t('Pass details')}</b>
            <h3>{result.visitor}</h3>
            {result.company ? <p>{result.company}</p> : null}
            <div className="detail-row">
              <span className="k">{t('Host')}</span>
              <span className="v">
                {result.host}
                {result.department && result.department !== '—' ? ` · ${result.department}` : ''}
              </span>
            </div>
            <div className="detail-row">
              <span className="k">{t('Date / Time')}</span>
              <span className="v">
                {result.date} · {result.time}
              </span>
            </div>
            <div className="detail-row">
              <span className="k">{t('Purpose')}</span>
              <span className="v">{result.purpose}</span>
            </div>
            <div className="detail-row">
              <span className="k">{t('Reference')}</span>
              <span className="v">{result.ref}</span>
            </div>
            <div className="detail-row">
              <span className="k">{t('Status')}</span>
              <span className="v">{t(STATUS[result.status] || result.status)}</span>
            </div>
          </div>
        ) : null}
        <div className="form-actions">
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={lookupOnly}>
            <QrCode size={15} /> {t('View details')}
          </button>
          <button className="btn btn-teal" type="button" disabled={busy} onClick={checkIn}>
            <CheckCircle2 size={15} /> {t('Validate')}
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">
            <span className="panel-ic">
              <CalendarDays size={16} strokeWidth={2} />
            </span>
            <div>
              <h3>{t("Today's visits")}</h3>
              <p>{t('Read-only list of everyone expected today')}</p>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" type="button" onClick={loadToday} disabled={loadingToday}>
            <RefreshCw size={14} /> {t('Refresh')}
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Time')}</th>
                <th>{t('Visitor')}</th>
                <th>{t('Host')}</th>
                <th>{t('Reference')}</th>
                <th>{t('Status')}</th>
              </tr>
            </thead>
            <tbody>
              {today.length ? (
                today.map((v) => (
                  <tr key={v.id}>
                    <td className="cell-main nowrap" data-label={t('Time')}>
                      {v.time}
                    </td>
                    <td data-label={t('Visitor')}>
                      <div className="cell-main">{v.visitor}</div>
                      {v.company ? <div className="cell-sub">{v.company}</div> : null}
                    </td>
                    <td data-label={t('Host')}>{v.host}</td>
                    <td className="nowrap" data-label={t('Reference')}>
                      {v.ref}
                    </td>
                    <td data-label={t('Status')}>
                      <span className={`badge ${STATUS[v.status] ? v.status : 'active'}`}>{t(STATUS[v.status] || v.status)}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="empty">
                    {loadingToday ? t('Loading…') : t('No visits scheduled for today')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
