import { useEffect, useState } from 'react';
import { QrCode, ShieldCheck } from 'lucide-react';
import api from '../api/client';
import { LanguageSwitch, useI18n } from '../i18n';

const STATUS = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', used: 'Checked in', cancelled: 'Cancelled' };

// The visitor's own pass page (public, no login): /pass/<token> from the WhatsApp QR link.
export default function PassPage({ token }) {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/passes/info/${encodeURIComponent(token)}`);
        if (!cancelled) setData(res.data);
      } catch (err) {
        if (!cancelled) setError(err.response?.status === 404 ? t('Pass not found') : err.response?.data?.error || t('Could not load this pass'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="pass-page">
      <div className="pass-lang">
        <LanguageSwitch />
      </div>
      <div className="pass-card">
        <div className="pass-brand">
          <ShieldCheck size={20} /> Botho Innovations
        </div>
        {error ? (
          <p className="gate-error">{error}</p>
        ) : !data ? (
          <p className="pass-sub">{t('Loading pass…')}</p>
        ) : (
          <>
            <span className={`badge ${STATUS[data.status] ? data.status : 'active'}`}>{t(STATUS[data.status] || data.status)}</span>
            <h1>{data.visitor}</h1>
            {data.company ? <p className="pass-sub">{data.company}</p> : null}
            <div className="detail-row">
              <span className="k">{t('Host')}</span>
              <span className="v">{data.host}</span>
            </div>
            <div className="detail-row">
              <span className="k">{t('Date / Time')}</span>
              <span className="v">
                {data.date} · {data.time}
              </span>
            </div>
            <div className="detail-row">
              <span className="k">{t('Purpose')}</span>
              <span className="v">{data.purpose}</span>
            </div>
            <div className="detail-row">
              <span className="k">{t('Reference')}</span>
              <span className="v">{data.ref}</span>
            </div>
            {data.pin ? (
              <div className="detail-row">
                <span className="k">{t('Backup PIN')}</span>
                <span className="v">{data.pin}</span>
              </div>
            ) : null}
            <div className="pass-foot">
              <QrCode size={16} /> {t('Show this page at the gate')}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
