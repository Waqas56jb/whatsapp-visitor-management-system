import { useEffect, useState } from 'react';
import { Link2, QrCode, RefreshCw, Unplug } from 'lucide-react';
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
    setBusy(true);
    try {
      const { data } = await api.post('/host/whatsapp/connect');
      setStatus(data || {});
      onToast?.('Scan the QR with WhatsApp → Linked devices');
    } catch (err) {
      onToast?.(err.response?.data?.error || 'Could not start WhatsApp link', true);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm('Unlink this WhatsApp? Visitors will not reach your AI agent until you scan again.')) return;
    setBusy(true);
    try {
      const { data } = await api.post('/host/whatsapp/disconnect');
      setStatus(data || {});
      onToast?.('WhatsApp unlinked');
    } catch (err) {
      onToast?.(err.response?.data?.error || 'Could not unlink', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ap-panel">
      <div className="ap-panel-head">
        <div className="ap-panel-title">
          <span className="ap-panel-ic">
            <QrCode size={16} strokeWidth={2} />
          </span>
          <div>
            <h3>Link your WhatsApp</h3>
            <p>Scan this QR so visitors can book with your number. The AI agent replies from this WhatsApp.</p>
          </div>
        </div>
        <span className={'ap-badge ' + (status.connected ? 'approved' : 'pending')}>
          {status.connected ? 'Linked' : status.connecting ? 'Waiting for scan' : 'Not linked'}
        </span>
      </div>
      <div className="wa-link-body">
        {status.connected ? (
          <div className="wa-linked">
            <Link2 size={28} strokeWidth={1.7} />
            <b>Connected as {status.user?.name || status.user?.id || 'WhatsApp'}</b>
            <p>Visitors who message this number are handled by your knowledge-base AI agent. Approve from this portal or reply APPROVE VMS-… in WhatsApp.</p>
            <button className="ap-btn ap-btn-danger ap-btn-sm" onClick={disconnect} disabled={busy}>
              <Unplug size={14} /> Unlink
            </button>
          </div>
        ) : (
          <>
            <div className="wa-qr-wrap">
              {status.qrDataUrl ? (
                <img src={status.qrDataUrl} alt="WhatsApp linking QR" />
              ) : (
                <div className="wa-qr-empty">
                  <QrCode size={36} strokeWidth={1.5} />
                  <p>Click Generate QR, then scan with your phone</p>
                </div>
              )}
            </div>
            <ol className="wa-steps">
              <li>Open WhatsApp on your phone</li>
              <li>Settings → Linked devices → Link a device</li>
              <li>Scan the QR on this page</li>
            </ol>
            <button className="ap-btn ap-btn-teal" onClick={connect} disabled={busy}>
              <RefreshCw size={15} /> {status.qrDataUrl ? 'Refresh QR' : 'Generate QR'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
