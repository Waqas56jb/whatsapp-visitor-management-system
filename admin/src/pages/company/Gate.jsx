import { useState } from 'react';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckCircle2, FileImage, LogOut, MapPin, QrCode, ScanLine, Users, X } from 'lucide-react';
import api, { errorText, openFile } from '../../api/client';
import { useI18n } from '../../i18n';
import { act, Badge, EmptyRow, Field, notify, Panel, Stat, useApi } from '../../ui';

const REASONS = {
  not_today: 'This pass is for another day',
  already_used: 'This pass has already been used',
  expired: 'This pass has expired',
  not_approved: 'This visit is not approved',
  not_found: 'Pass not found',
};

export default function Gate() {
  const { t, formatDateTime } = useI18n();
  const { data, reload } = useApi('/gate/traffic', { interval: 10000 });
  const [pin, setPin] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  function codes() {
    const code = pin.trim();
    const qr = token.trim();
    if (!code && !qr) setError(t('Scan the QR or enter the 6-digit PIN.'));
    return { code, qr };
  }

  async function lookup() {
    const { code, qr } = codes();
    if (!code && !qr) return;
    setBusy(true);
    setError('');
    try {
      const { data: d } = await api.get('/passes/info', { params: code ? { pin: code } : { token: qr } });
      setResult({ mode: 'info', ...d });
    } catch (err) {
      setResult(null);
      setError(errorText(err, t('Pass not found')));
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
      const { data: d } = await api.post('/passes/validate', { pin: code || undefined, token: qr || undefined });
      setResult({
        mode: 'checked',
        visitor: d.visitor?.name,
        company: d.visitor?.company,
        host: d.visit?.host,
        department: d.visit?.department,
        purpose: d.visit?.purpose,
        date: d.visit?.date,
        time: d.visit?.time,
        ref: d.visit?.ref,
        flagged: d.visit?.flagged,
        flagReason: d.visit?.flagReason,
        hostNotified: d.hostNotified,
        status: 'used',
      });
      setPin('');
      setToken('');
      reload();
    } catch (err) {
      setResult(null);
      setError(t(REASONS[err.response?.data?.reason] || '') || errorText(err, t('Could not validate this pass')));
    } finally {
      setBusy(false);
    }
  }

  async function checkOut(v) {
    if (await act(() => api.post(`/visits/${v.id}/checkout`), t('{name} checked out — feedback request sent on WhatsApp', { name: v.visitor }), t('Could not check out'))) reload();
  }

  const onSite = data?.onSite || [];
  const expected = data?.expected || [];
  const events = data?.events || [];

  return (
    <>
      <div className="stat-row three">
        <Stat icon={MapPin} tone="ok" label={t('On site now')} value={onSite.length} />
        <Stat icon={Users} label={t('Still expected today')} value={expected.length} />
        <Stat icon={ArrowDownLeft} tone="blue" label={t('Movements today')} value={events.length} />
      </div>
      <div className="grid-2">
        <Panel icon={ScanLine} title={t('Check in')} sub={t('Scan the WhatsApp QR (or paste the pass link) or type the backup PIN.')}>
          <div className="form-grid">
            <Field label={t('QR token or pass link')}>
              <input value={token} onChange={(e) => setToken(e.target.value)} placeholder={t('Paste the scanned QR or pass link')} />
            </Field>
            <Field label={t('Backup PIN')}>
              <input inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder={t('6-digit PIN')} />
            </Field>
          </div>
          {error ? (
            <p className="gate-error">
              <X size={14} /> {error}
            </p>
          ) : null}
          {result ? (
            <div className={'gate-result' + (result.mode === 'checked' ? ' ok' : '')}>
              <b>{result.mode === 'checked' ? t('Access granted') : t('Pass details')}</b>
              {result.flagged ? (
                <p className="secret-warning">
                  <AlertTriangle size={15} /> {t('Flagged')}: {result.flagReason}
                </p>
              ) : null}
              <h3>{result.visitor}</h3>
              {result.company && result.company !== '—' ? <p>{result.company}</p> : null}
              {[
                ['Host', `${result.host}${result.department && result.department !== '—' ? ` · ${result.department}` : ''}`],
                ['Date / Time', `${result.date} · ${result.time}`],
                ['Purpose', result.purpose],
                ['Reference', result.ref],
              ].map(([k, v]) => (
                <div className="detail-row" key={k}>
                  <span className="k">{t(k)}</span>
                  <span className="v">{v}</span>
                </div>
              ))}
              <div className="detail-row">
                <span className="k">{t('Status')}</span>
                <span className="v">
                  <Badge status={result.status} />
                </span>
              </div>
              {result.mode === 'checked' ? <p className="mini-note flush">{result.hostNotified ? t('The host was told on WhatsApp.') : t('The host could not be notified on WhatsApp.')}</p> : null}
            </div>
          ) : null}
          <div className="form-actions">
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={lookup}>
              <QrCode size={15} /> {t('View details')}
            </button>
            <button className="btn btn-teal" type="button" disabled={busy} onClick={checkIn}>
              <CheckCircle2 size={15} /> {t('Check in')}
            </button>
          </div>
        </Panel>

        <Panel icon={ArrowDownLeft} title={t('Live gate traffic')} sub={t('Refreshes every 10 seconds')}>
          <div className="feed">
            {events.length ? (
              events.slice(0, 12).map((e, i) => (
                <div className="feed-item" key={i}>
                  <div className="feed-dot" style={{ background: e.type === 'in' ? 'var(--ok-bg)' : '#EAF3FF', color: e.type === 'in' ? 'var(--ok)' : '#2563EB' }}>
                    {e.type === 'in' ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
                  </div>
                  <div>
                    <p>
                      <b>{e.visit.visitor}</b> — {e.type === 'in' ? t('entered') : t('left')} · {t('host')} {e.visit.host}
                    </p>
                    <span>{formatDateTime(e.at)}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="mini-note pad">{t('No movements yet today')}</p>
            )}
          </div>
        </Panel>
      </div>

      <Panel icon={MapPin} title={t('On site now')} sub={t('Check visitors out when they leave; they are asked for feedback on WhatsApp')}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Visitor')}</th>
                <th>{t('Host')}</th>
                <th>{t('Checked in')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {onSite.length ? (
                onSite.map((v) => (
                  <tr key={v.id}>
                    <td data-label={t('Visitor')}>
                      <div className="cell-main">{v.visitor}</div>
                      <div className="cell-sub">{v.ref}</div>
                    </td>
                    <td data-label={t('Host')}>{v.host}</td>
                    <td data-label={t('Checked in')}>{formatDateTime(v.usedAt)}</td>
                    <td data-label={t('Actions')}>
                      <button className="btn btn-sm btn-ghost" onClick={() => checkOut(v)}>
                        <LogOut size={13} /> {t('Check out')}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <EmptyRow cols={4}>{t('Nobody is on site right now')}</EmptyRow>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel icon={Users} title={t('Still expected today')} sub={t('Approved and not yet arrived')}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Time')}</th>
                <th>{t('Visitor')}</th>
                <th>{t('Host')}</th>
                <th>{t('Reference')}</th>
              </tr>
            </thead>
            <tbody>
              {expected.length ? (
                expected.map((v) => (
                  <tr key={v.id}>
                    <td data-label={t('Time')} className="cell-main">
                      {v.time}
                    </td>
                    <td data-label={t('Visitor')}>
                      {v.visitor} {v.flagged ? <span className="flag-tag">{t('Flagged')}</span> : null}
                    </td>
                    <td data-label={t('Host')}>{v.host}</td>
                    <td data-label={t('Reference')}>{v.ref}</td>
                  </tr>
                ))
              ) : (
                <EmptyRow cols={4}>{t('Nobody else is expected today')}</EmptyRow>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

export function ViewIdButton({ id }) {
  const { t } = useI18n();
  if (!id) return null;
  return (
    <button className="btn btn-sm btn-ghost" onClick={() => openFile(`/documents/${id}`).catch((err) => notify.err(errorText(err, t('Could not open the document'))))}>
      <FileImage size={13} /> {t('ID')}
    </button>
  );
}
