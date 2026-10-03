import { CircleDollarSign, Download, Gauge, HardDrive, MessageCircle, Network } from 'lucide-react';
import { useI18n } from '../../i18n';
import { Badge, Panel, Stat, fmtBytes, fmtMoney, fmtNumber, useApi } from '../../ui';

function limitText(used, limit, t) {
  return limit == null ? `${fmtNumber(used)} / ${t('unlimited')}` : `${fmtNumber(used)} / ${fmtNumber(limit)}`;
}

export default function Metering() {
  const { t } = useI18n();
  const { data } = useApi('/platform/metering', { interval: 60000 });
  if (!data) return <p className="mini-note pad">{t('Loading…')}</p>;
  const rows = data.rows;
  const total = (key) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);

  function exportCsv() {
    const head = ['Company', 'Status', 'Plan', 'Monthly price (BWP)', 'Storage bytes', 'Messages in', 'Messages out', 'Visits this month', 'API requests', 'Bandwidth bytes', 'AI calls'];
    const lines = rows.map((r) => [r.name, r.status, r.planName, r.price, r.storageBytes, r.messagesIn, r.messagesOut, r.visitsThisMonth, r.apiRequests, r.bandwidthBytes, r.aiCalls]);
    const csv = [head, ...lines].map((line) => line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `metering-${data.month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="stat-row">
        <Stat icon={CircleDollarSign} tone="ok" label={t('Billable this month')} value={fmtMoney(data.totals.revenue, data.totals.currency)} />
        <Stat icon={HardDrive} label={t('Storage used')} value={fmtBytes(total('storageBytes'))} />
        <Stat icon={MessageCircle} tone="teal" label={t('WhatsApp messages this month')} value={fmtNumber(total('messagesIn') + total('messagesOut'))} />
        <Stat icon={Network} tone="blue" label={t('API requests this month')} value={fmtNumber(total('apiRequests'))} hint={fmtBytes(total('bandwidthBytes'))} />
      </div>
      <Panel
        icon={Gauge}
        title={t('Resource metering per company')}
        sub={t('Since {date}. Storage is current; the rest is counted this month.', { date: data.month })}
        actions={
          <button className="btn btn-ghost btn-sm" onClick={exportCsv}>
            <Download size={14} /> {t('Export CSV')}
          </button>
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Company')}</th>
                <th>{t('Plan')}</th>
                <th>{t('Storage')}</th>
                <th>{t('Messages in / out')}</th>
                <th>{t('Visits / limit')}</th>
                <th>{t('API requests')}</th>
                <th>{t('Bandwidth')}</th>
                <th>{t('AI calls')}</th>
                <th>{t('Billable')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td data-label={t('Company')}>
                    <div className="cell-main">{r.name}</div>
                    <Badge status={r.status} />
                  </td>
                  <td data-label={t('Plan')}>{t(r.planName)}</td>
                  <td data-label={t('Storage')}>
                    <div>{fmtBytes(r.storageBytes)}</div>
                    <div className="cell-sub">
                      {fmtNumber(r.storageRows)} {t('records')}
                      {r.storageLimitMb != null ? ` · ${t('limit')} ${r.storageLimitMb} MB` : ''}
                    </div>
                  </td>
                  <td data-label={t('Messages in / out')}>
                    {fmtNumber(r.messagesIn)} / {fmtNumber(r.messagesOut)}
                    <div className="cell-sub">{limitText(r.messagesIn + r.messagesOut, r.messageLimit, t)}</div>
                  </td>
                  <td data-label={t('Visits / limit')}>{limitText(r.visitsThisMonth, r.visitLimit, t)}</td>
                  <td data-label={t('API requests')}>{fmtNumber(r.apiRequests)}</td>
                  <td data-label={t('Bandwidth')}>{fmtBytes(r.bandwidthBytes)}</td>
                  <td data-label={t('AI calls')}>{fmtNumber(r.aiCalls)}</td>
                  <td data-label={t('Billable')} className="cell-main nowrap">
                    {fmtMoney(r.price, r.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
