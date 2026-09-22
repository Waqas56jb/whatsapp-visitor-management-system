import { useEffect, useState } from 'react';
import { QrCode, ShieldCheck } from 'lucide-react';
import api from '../api/client';

export default function PassView({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/passes/info/${encodeURIComponent(token)}`);
        if (!cancelled) setData(res.data);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || 'Pass not found');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="pass-page">
      <div className="pass-card">
        <div className="pass-brand">
          <ShieldCheck size={22} /> Botho Innovations
        </div>
        {error ? (
          <p className="pass-error">{error}</p>
        ) : !data ? (
          <p>Loading pass…</p>
        ) : (
          <>
            <div className="pass-status">{data.status}</div>
            <h1>{data.visitor}</h1>
            <p className="pass-sub">{data.company}</p>
            <dl>
              <div>
                <dt>Host</dt>
                <dd>{data.host}</dd>
              </div>
              <div>
                <dt>When</dt>
                <dd>
                  {data.date} · {data.time}
                </dd>
              </div>
              <div>
                <dt>Purpose</dt>
                <dd>{data.purpose}</dd>
              </div>
              <div>
                <dt>Reference</dt>
                <dd>{data.ref}</dd>
              </div>
              {data.pin ? (
                <div>
                  <dt>Backup PIN</dt>
                  <dd>{data.pin}</dd>
                </div>
              ) : null}
            </dl>
            <div className="pass-foot">
              <QrCode size={16} /> Show this page at the gate
            </div>
          </>
        )}
      </div>
    </div>
  );
}
