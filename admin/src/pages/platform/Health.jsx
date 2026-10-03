import { Activity, Bot, Cpu, Database, Gauge, Mail, MemoryStick, RefreshCw, Smartphone, Timer } from 'lucide-react';
import { useI18n } from '../../i18n';
import { Badge, Panel, Stat, fmtDuration, fmtNumber, useApi } from '../../ui';

export default function Health() {
  const { t, formatDateTime } = useI18n();
  const { data, reload, loading } = useApi('/platform/health', { interval: 15000 });
  if (!data) return <p className="mini-note pad">{t('Loading…')}</p>;
  const r = data.requests;
  const operational = data.status === 'operational';
  return (
    <>
      <div className={`health-banner ${operational ? 'ok' : 'bad'}`}>
        <Activity size={18} />
        <b>{operational ? t('All systems operational') : t('Degraded: the database is not responding')}</b>
        <span>
          {t('Up for {duration}', { duration: fmtDuration(data.uptimeSeconds) })} · {t('since {date}', { date: formatDateTime(data.startedAt) })} · Node {data.node}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => reload()} disabled={loading}>
          <RefreshCw size={14} /> {t('Refresh')}
        </button>
      </div>
      <div className="stat-row">
        <Stat icon={Timer} tone="blue" label={t('Request latency p50 / p95')} value={`${r.p50Ms} / ${r.p95Ms} ms`} hint={t('p99 {value} ms', { value: r.p99Ms })} />
        <Stat icon={Gauge} label={t('Requests per minute')} value={fmtNumber(r.perMinute)} hint={t('{count} in the last {minutes} min', { count: fmtNumber(r.count), minutes: r.windowMinutes })} />
        <Stat icon={Activity} tone={r.errorRate > 1 ? 'bad' : 'ok'} label={t('Server error rate')} value={`${r.errorRate}%`} hint={t('{count} errors', { count: r.errors5xx })} />
        <Stat icon={Database} tone={data.database.ok ? 'ok' : 'bad'} label={t('Database latency')} value={data.database.ok ? `${data.database.latencyMs} ms` : t('Down')} />
      </div>
      <div className="grid-2">
        <Panel icon={Cpu} title={t('Server load')} sub={t('{cores} CPU cores', { cores: data.cpu.cores })}>
          <div className="kv-list">
            <div>
              <span>{t('Load average (1 / 5 / 15 min)')}</span>
              <b>{data.cpu.loadAvg.join(' / ')}</b>
            </div>
            <div>
              <span>{t('Event loop delay (mean / p99 / max)')}</span>
              <b>
                {data.eventLoop.meanMs} / {data.eventLoop.p99Ms} / {data.eventLoop.maxMs} ms
              </b>
            </div>
            <div>
              <span>
                <MemoryStick size={14} /> {t('Memory (process)')}
              </span>
              <b>
                {data.memory.rssMb} MB {t('resident')} · {data.memory.heapUsedMb} / {data.memory.heapTotalMb} MB {t('heap')}
              </b>
            </div>
            <div>
              <span>{t('Memory (system free / total)')}</span>
              <b>
                {data.memory.systemFreeMb} / {data.memory.systemTotalMb} MB
              </b>
            </div>
            <div>
              <span>
                <Mail size={14} /> {t('Email (announcements)')}
              </span>
              <b>{data.email.configured ? t('Configured') : t('Not configured')}</b>
            </div>
            <div>
              <span>
                <Bot size={14} /> {t('AI answers')}
              </span>
              <b>{data.ai.configured ? t('Configured') : t('Not configured')}</b>
            </div>
          </div>
        </Panel>
        <Panel icon={Smartphone} title={t('WhatsApp sessions')} sub={t('{connected} connected · {linked} companies linked', { connected: data.whatsapp.connected, linked: data.whatsapp.linkedCompanies })}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('Company')}</th>
                  <th>{t('Session')}</th>
                </tr>
              </thead>
              <tbody>
                {data.whatsapp.sessions.length ? (
                  data.whatsapp.sessions.map((s) => (
                    <tr key={s.companyId}>
                      <td data-label={t('Company')}>{s.company}</td>
                      <td data-label={t('Session')}>
                        <Badge status={s.connected ? 'connected' : s.waitingForQr ? 'pending' : s.connecting ? 'connecting' : 'disconnected'} label={s.waitingForQr ? t('Waiting for QR scan') : undefined} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="2" className="empty">
                      {t('No WhatsApp sessions are running')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
