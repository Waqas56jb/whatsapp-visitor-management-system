import { useEffect, useState } from 'react';
import { Building2, Link2, QrCode, RefreshCw, Unplug } from 'lucide-react';
import api from '../api/client';
import { useI18n } from '../i18n';

// The organisation's single WhatsApp number (super_admin only). The status shown is always the
// server's; nothing is cached in the browser.
export default function CompanyWhatsApp({ onToast }) {
  const { t } = useI18n();
  const [status, setStatus] = useState({ connected: false, connecting: false, qrDataUrl: null, user: null });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { data } = await api.get('/settings/whatsapp');
      setStatus(data || {});
      setLoaded(true);
    } catch {
      /* keep the last known status */
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, []);

  async function connect() {
    setBusy(true);
    try {
      const { data } = await api.post('/settings/whatsapp/connect');
      setStatus(data || {});
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
      const { data } = await api.post('/settings/whatsapp/disconnect');
      setStatus(data || { connected: false });
      onToast?.(t('Company WhatsApp unlinked'));
    } catch (err) {
      onToast?.(err.response?.data?.error || t('Could not unlink'), true);
    } finally {
      setBusy(false);
    }
  }

  const digits = String(status.phone || status.user?.id || '')
    .split('@')[0]
    .split(':')[0]
    .replace(/\D/g, '');
  const linkedNumber = digits ? `+${digits}` : status.user?.name || t('Company WhatsApp');
  const badge = !loaded
    ? t('Loading…')
    : status.connected
      ? status.reconnecting
        ? t('Linked · reconnecting')
        : t('Linked')
      : status.qrDataUrl
        ? t('Waiting for scan')
        : status.connecting
          ? t('Linking…')
          : t('Not linked');

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">
          <span className="panel-ic">
            <Building2 size={16} strokeWidth={2} />
          </span>
          <div>
            <h3>{t('Company WhatsApp')}</h3>
            <p>{t('Visitors message this one company number to book. Hosts are notified on their own numbers from the Hosts page.')}</p>
          </div>
        </div>
        <span className={'badge ' + (status.connected ? 'approved' : 'pending')}>{badge}</span>
      </div>
      <div className="wa-body">
        {status.connected ? (
          <div className="wa-linked">
            <Link2 size={28} strokeWidth={1.7} />
            <b>{t('Linked number: {number}', { number: linkedNumber })}</b>
            <p>
              {status.reconnecting
                ? t('The session is reconnecting. No new QR is needed.')
                : t('The visitor assistant is live on this number.')}
            </p>
            <button className="btn btn-danger btn-sm" onClick={disconnect} disabled={busy}>
              <Unplug size={14} /> {t('Unlink company number')}
            </button>
          </div>
        ) : (
          <>
            <div className="wa-qr">
              {status.qrDataUrl ? (
                <img src={status.qrDataUrl} alt={t('Company WhatsApp QR code')} />
              ) : (
                <div className="wa-qr-empty">
                  <QrCode size={36} strokeWidth={1.5} />
                  <p>{t('Generate the QR, then scan it with the company WhatsApp')}</p>
                </div>
              )}
            </div>
            <div className="wa-steps">
              <ol>
                <li>{t('Use the company WhatsApp — not a host’s personal phone')}</li>
                <li>{t('In WhatsApp open Linked devices → Link a device')}</li>
                <li>{t('Scan this QR code')}</li>
              </ol>
              <button className="btn btn-violet" onClick={connect} disabled={busy}>
                <RefreshCw size={15} /> {status.qrDataUrl ? t('Show QR') : t('Generate QR')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
