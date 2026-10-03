import { Activity, Building2, CircleDollarSign, Layers, MessageCircle, PauseCircle, Smartphone, Users } from 'lucide-react';
import { useI18n } from '../../i18n';
import { Badge, Bars, Columns, Panel, Stat, fmtMoney, fmtNumber, useApi } from '../../ui';

export default function PlatformOverview({ go }) {
  const { t, formatDate } = useI18n();
  const { data, loading } = useApi('/platform/overview', { interval: 60000 });
  if (loading && !data) return <p className="mini-note pad">{t('Loading…')}</p>;
  if (!data) return null;
  const c = data.counts;
  const days = data.visitsByDay.map((d) => ({ label: d.day.slice(8, 10), value: d.visits }));
  const messages = {};
  for (const u of data.usage) if (u.metric === 'wa_messages_in' || u.metric === 'wa_messages_out') messages[u.day] = (messages[u.day] || 0) + u.value;
  const apiCalls = data.usage.filter((u) => u.metric === 'api_requests').reduce((s, u) => s + u.value, 0);

  return (
    <>
      <div className="dash-hero">
        <div>
          <h3>{t('Platform overview')}</h3>
          <p>{t('Tenants, subscriptions and platform-wide activity. Company operations stay private to each company.')}</p>
        </div>
        <div className="dash-hero-meta">
          <Activity size={18} strokeWidth={1.9} />
          {formatDate(new Date(), { weekday: true })}
        </div>
      </div>
      <div className="stat-row">
        <Stat icon={Building2} label={t('Companies')} value={fmtNumber(c.companies)} hint={t('{active} active · {suspended} suspended', { active: c.active, suspended: c.suspended })} />
        <Stat icon={CircleDollarSign} tone="ok" label={t('Monthly recurring revenue')} value={fmtMoney(data.mrr, data.currency)} />
        <Stat icon={Users} tone="blue" label={t('Visits in the last 30 days')} value={fmtNumber(c.visits30)} hint={t('{total} all time', { total: fmtNumber(c.visits) })} />
        <Stat icon={Smartphone} tone="teal" label={t('Companies with WhatsApp linked')} value={fmtNumber(c.whatsappLinked)} hint={t('{users} staff logins', { users: c.users })} />
      </div>

      <div className="grid-2">
        <Panel icon={Activity} title={t('Visit requests per day')} sub={t('All companies, last 30 days')}>
          {days.length ? <Columns items={days} /> : <p className="mini-note pad">{t('No visits yet')}</p>}
        </Panel>
        <Panel icon={Layers} title={t('Companies by plan')} sub={t('Active subscriptions')}>
          <Bars items={data.byPlan.map((p) => ({ label: t(p.name), value: p.count }))} empty={t('No companies yet')} />
          <div className="kv-row">
            <span>
              <MessageCircle size={14} /> {t('WhatsApp messages (30 days)')}: <b>{fmtNumber(Object.values(messages).reduce((s, v) => s + v, 0))}</b>
            </span>
            <span>
              <PauseCircle size={14} /> {t('API requests (30 days)')}: <b>{fmtNumber(apiCalls)}</b>
            </span>
          </div>
        </Panel>
      </div>

      <div className="grid-2">
        <Panel icon={Building2} title={t('Most active companies')} sub={t('By total visit requests')} actions={<button className="btn btn-ghost btn-sm" onClick={() => go('p-companies')}>{t('All companies')}</button>}>
          <CompanyTable rows={data.topCompanies} go={go} />
        </Panel>
        <Panel icon={Building2} title={t('Newest companies')} sub={t('Recently onboarded')}>
          <CompanyTable rows={data.recentCompanies} go={go} />
        </Panel>
      </div>
    </>
  );
}

function CompanyTable({ rows, go }) {
  const { t } = useI18n();
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{t('Company')}</th>
            <th>{t('Plan')}</th>
            <th>{t('Visits')}</th>
            <th>{t('Status')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="clickable" onClick={() => go('p-company', { id: c.id })}>
              <td data-label={t('Company')}>
                <div className="cell-main">{c.name}</div>
                <div className="cell-sub">{c.created}</div>
              </td>
              <td data-label={t('Plan')}>{t(c.planName)}</td>
              <td data-label={t('Visits')}>{fmtNumber(c.visits)}</td>
              <td data-label={t('Status')}>
                <Badge status={c.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
