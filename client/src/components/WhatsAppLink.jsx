import { useEffect, useState } from 'react';
import { Building2, Link2, QrCode, RefreshCw, Unplug } from 'lucide-react';
import api from '../api/client';

export default function WhatsAppLink({ onToast }) {
  const [status, setStatus] = useState({ connected: false, connecting: false, qrDataUrl: null, user: null });
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { data } = await api.get('/host/whatsapp/status');
      setStatus(data || {});
    } catch {
      /* keep last */
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, []);

  async function connect() {
    if (status.connected) {
      onToast?.('Company number is already linked. No new QR will be issued.');
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post('/host/whatsapp/connect');
      setStatus(data || {});
      if (data?.connected) onToast?.('Company WhatsApp is already linked');
      else onToast?.('Scan this QR with the company WhatsApp number');
    } catch (err) {
      onToast?.(err.response?.data?.error || 'Could not start company WhatsApp link', true);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm('Unlink the company WhatsApp? Every client account will lose this number until it is scanned again.')) {
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post('/host/whatsapp/disconnect');
      setStatus(data || {});
      onToast?.('Company WhatsApp unlinked');
    } catch (err) {
      onToast?.(err.response?.data?.error || 'Could not unlink', true);
    } finally {
      setBusy(false);
    }
  }

  const linkedDigits = String(status.user?.id || '')
    .split('@')[0]
    .split(':')[0]
    .replace(/\D/g, '');
  const linkedNumber = linkedDigits ? `+${linkedDigits}` : status.user?.name || 'Company WhatsApp';

  return (
    <div className="ap-panel">
      <div className="ap-panel-head">
        <div className="ap-panel-title">
          <span className="ap-panel-ic">
            <Building2 size={16} strokeWidth={2} />
          </span>
          <div>
            <h3>Please scan company number</h3>
            <p>One organisation WhatsApp only. Every client account sees this same link — no extra QR per account.</p>
          </div>
        </div>
        <span className={'ap-badge ' + (status.connected ? 'approved' : 'pending')}>
          {status.connected ? 'Company linked' : status.connecting ? 'Waiting for company scan' : 'Not linked'}
        </span>
      </div>
      <div className="wa-link-body">
        {status.connected ? (
          <div className="wa-linked">
            <Link2 size={28} strokeWidth={1.7} />
            <b>Company number linked: {linkedNumber}</b>
            <p>Visitors message this company WhatsApp. Hosts are notified on the personal numbers saved in Company hosts. All client accounts see this same connection.</p>
            <button className="ap-btn ap-btn-danger ap-btn-sm" onClick={disconnect} disabled={busy}>
              <Unplug size={14} /> Unlink company number
            </button>
          </div>
        ) : (
          <>
            <p className="wa-scan-banner">Please scan company number</p>
            <div className="wa-qr-wrap">
              {status.qrDataUrl ? (
                <img src={status.qrDataUrl} alt="Company WhatsApp QR" />
              ) : (
                <div className="wa-qr-empty">
                  <QrCode size={36} strokeWidth={1.5} />
                  <p>Generate the company QR, then scan it with the organisation WhatsApp</p>
                </div>
              )}
            </div>
            <ol className="wa-steps">
              <li>Use the company WhatsApp — not a host’s personal phone</li>
              <li>WhatsApp → Linked devices → Link a device</li>
              <li>Scan this QR. Other accounts will see this same linked number</li>
            </ol>
            <button className="ap-btn ap-btn-teal" onClick={connect} disabled={busy || status.connected}>
              <RefreshCw size={15} /> {status.qrDataUrl ? 'Show company QR' : 'Generate company QR'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
