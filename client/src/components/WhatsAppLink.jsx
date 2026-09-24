import { useEffect, useState } from 'react';
import { Building2, Link2, QrCode, RefreshCw, Unplug } from 'lucide-react';
import api from '../api/client';
import { useI18n } from '../i18n';

const LINK_KEY = 'botho_company_wa';

function readSaved() {
  try {
    const raw = sessionStorage.getItem(LINK_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function WhatsAppLink({ onToast }) {
  const { t } = useI18n();
  const saved = readSaved();
  const [status, setStatus] = useState(
    saved?.connected
      ? { connected: true, connecting: false, qrDataUrl: null, user: saved.user, phone: saved.phone }
      : { connected: false, connecting: false, qrDataUrl: null, user: null }
  );
  const [busy, setBusy] = useState(false);

  function apply(data) {
    const next = data || {};
    if (next.connected) {
      sessionStorage.setItem(
        LINK_KEY,
        JSON.stringify({ connected: true, user: next.user || null, phone: next.phone || next.user?.id || null })
      );
    } else if (next.connected === false && !next.connecting) {
      sessionStorage.removeItem(LINK_KEY);
    }
    setStatus((prev) => {
      if (prev.connected && next.qrDataUrl && !next.connected) return prev;
      return next;
    });
  }

  async function load() {
    try {
      const { data } = await api.get('/host/whatsapp/status');
      apply(data);
    } catch {
      /* keep last */
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 1500);
    return () => clearInterval(timer);
  }, []);

  async function connect() {
    if (status.connected) {
      onToast?.(t('The company number is already linked.'));
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post('/host/whatsapp/connect');
      apply(data);
      onToast?.(data?.connected ? t('The company number is already linked.') : t('Scan this QR with the company WhatsApp'));
    } catch (err) {
      onToast?.(err.response?.data?.error || t('Could not start the WhatsApp link'), true);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm(t('Unlink the company WhatsApp? Visitors will get no replies until it is scanned again.'))) return;
    setBusy(true);
    try {
      const { data } = await api.post('/host/whatsapp/disconnect');
      sessionStorage.removeItem(LINK_KEY);
      setStatus(data || { connected: false });
      onToast?.(t('Company WhatsApp unlinked'));
    } catch (err) {
      onToast?.(err.response?.data?.error || t('Could not unlink'), true);
    } finally {
      setBusy(false);
    }
  }

  const linkedDigits = String(status.phone || status.user?.id || '')
    .split('@')[0]
    .split(':')[0]
    .replace(/\D/g, '');
  const linkedNumber = linkedDigits ? `+${linkedDigits}` : status.user?.name || t('Company WhatsApp');

  const badge = status.connected
    ? status.reconnecting
      ? t('Linked · reconnecting')
      : t('Linked')
    : status.qrDataUrl
      ? t('Waiting for scan')
      : status.connecting
        ? t('Linking…')
        : t('Not linked');

  return (
    <div className="ap-panel">
      <div className="ap-panel-head">
        <div className="ap-panel-title">
          <span className="ap-panel-ic">
            <Building2 size={16} strokeWidth={2} />
          </span>
          <div>
            <h3>{t('Company WhatsApp')}</h3>
            <p>{t('Visitors message this one company number to book. Every portal account shares the same link.')}</p>
          </div>
        </div>
        <span className={'ap-badge ' + (status.connected ? 'approved' : 'pending')}>{badge}</span>
      </div>
      <div className="wa-link-body">
        {status.connected ? (
          <div className="wa-linked">
            <Link2 size={28} strokeWidth={1.7} />
            <b>{t('Linked number: {number}', { number: linkedNumber })}</b>
            <p>
              {status.reconnecting
                ? t('The session is reconnecting. No new QR is needed.')
                : t('The visitor assistant is live on this number. Hosts are notified on their personal numbers from the Hosts page.')}
            </p>
            <button className="ap-btn ap-btn-danger ap-btn-sm" onClick={disconnect} disabled={busy}>
              <Unplug size={14} /> {t('Unlink company number')}
            </button>
          </div>
        ) : (
          <>
            <div className="wa-qr-wrap">
              {status.qrDataUrl ? (
                <img src={status.qrDataUrl} alt={t('Company WhatsApp QR code')} />
              ) : (
                <div className="wa-qr-empty">
                  <QrCode size={36} strokeWidth={1.5} />
                  <p>{t('Generate the QR, then scan it with the company WhatsApp')}</p>
                </div>
              )}
            </div>
            <ol className="wa-steps">
              <li>{t('Use the company WhatsApp — not a host’s personal phone')}</li>
              <li>{t('In WhatsApp open Linked devices → Link a device')}</li>
              <li>{t('Scan this QR code')}</li>
            </ol>
            <button className="ap-btn ap-btn-teal" onClick={connect} disabled={busy || status.connected}>
              <RefreshCw size={15} /> {status.qrDataUrl ? t('Show QR') : t('Generate QR')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
