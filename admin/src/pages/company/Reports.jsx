import { useState } from 'react';
import { BarChart3, CalendarDays, CheckCircle2, Clock, Download, FileText, MessageSquareHeart, Star, Users, Wrench } from 'lucide-react';
import { blobError, download } from '../../api/client';
import { useI18n } from '../../i18n';
import { Bars, Columns, notify, Panel, Stat, daysAgoIso, todayIso, useApi } from '../../ui';

const EXPORTS = [
  ['visits', 'Visits'],
  ['visitors', 'Visitors'],
  ['daily', 'Visits per day'],
  ['peak', 'Peak hours'],
  ['hosts', 'Host activity'],
  ['feedback', 'Feedback'],
  ['service', 'Service requests'],
  ['audit', 'Audit log'],
];

export default function Reports({ me }) {
  const { t } = useI18n();
  const [from, setFrom] = useState(daysAgoIso(29));
  const [to, setTo] = useState(todayIso());
  const { data } = useApi('/reports/summary', { params: { from, to } });
  const pdf = me.company.features.reports_pdf;

  async function csv(type, label) {
    try {
      await download('/reports/export', `${type}-${from}-to-${to}.csv`, { type, from, to });
      notify.ok(t('{name} downloaded', { name: t(label) }));
    } catch (err) {
      notify.err(await blobError(err, t('Nothing to export for this period')));
    }
  }

  async function pdfReport() {
    try {
      await download('/reports/pdf', `report-${from}-to-${to}.pdf`, { from, to });
      notify.ok(t('PDF report downloaded'));
    } catch (err) {
      notify.err(await blobError(err, t('Could not create the PDF')));
    }
  }

  const tot = data?.totals;
  return (
    <>
      <div className="range-bar">
        <label>
          {t('From')} <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          {t('To')} <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        {[7, 30, 90].map((d) => (
          <button key={d} className="btn btn-ghost btn-sm" onClick={() => { setFrom(daysAgoIso(d - 1)); setTo(todayIso()); }}>
            {t('Last {days} days', { days: d })}
          </button>
        ))}
        {pdf ? (
          <button className="btn btn-violet btn-sm" onClick={pdfReport}>
            <FileText size={14} /> {t('Download PDF report')}
          </button>
        ) : (
          <span className="mini-note flush">{t('PDF reports are not included in your plan')}</span>
        )}
      </div>
      {tot ? (
        <>
          <div className="stat-row">
            <Stat icon={CalendarDays} label={t('Visit requests')} value={tot.visits} />
            <Stat icon={CheckCircle2} tone="ok" label={t('Approved')} value={tot.approved} hint={t('{count} checked in', { count: tot.checkedIn })} />
            <Stat icon={Clock} tone="blue" label={t('Peak check-in hour')} value={tot.peakHour || '—'} />
            <Stat icon={Star} tone="warn" label={t('Average rating')} value={tot.averageRating == null ? '—' : `${tot.averageRating} / 5`} hint={t('{count} complaints', { count: tot.complaints })} />
          </div>
          <div className="grid-2">
            <Panel icon={BarChart3} title={t('Visit volume')} sub={t('Requests per day')}>
              {data.byDay.length ? <Columns items={data.byDay.map((d) => ({ label: d.day.slice(5), value: d.visits }))} /> : <p className="mini-note pad">{t('No visits in this period')}</p>}
            </Panel>
            <Panel icon={Clock} title={t('Peak hours')} sub={t('Check-ins by hour of day')}>
              <Columns items={data.byHour.filter((h) => h.hour >= 6 && h.hour <= 20).map((h) => ({ label: String(h.hour).padStart(2, '0'), value: h.checkIns }))} />
            </Panel>
          </div>
          <div className="grid-2">
            <Panel icon={Users} title={t('Host activity')} sub={t('Visits per host, with approvals and declines')}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t('Host')}</th>
                      <th>{t('Visits')}</th>
                      <th>{t('Approved')}</th>
                      <th>{t('Declined')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byHost.length ? (
                      data.byHost.map((h) => (
                        <tr key={h.host}>
                          <td data-label={t('Host')}>
                            <div className="cell-main">{h.host}</div>
                            <div className="cell-sub">{h.department}</div>
                          </td>
                          <td data-label={t('Visits')}>{h.visits}</td>
                          <td data-label={t('Approved')}>{h.approved}</td>
                          <td data-label={t('Declined')}>{h.rejected}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4" className="empty">
                          {t('No host activity in this period')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>
            <Panel icon={MessageSquareHeart} title={t('Outcomes')} sub={t('Status of requests in this period')}>
              <Bars items={data.byStatus.map((s) => ({ label: t(s.status), value: s.count }))} empty={t('No visits in this period')} />
              <div className="kv-row">
                <span>
                  <Wrench size={14} /> {t('Service requests')}: <b>{tot.serviceRequests}</b> ({t('{count} open', { count: tot.openServiceRequests })})
                </span>
                <span>
                  <MessageSquareHeart size={14} /> {t('Feedback')}: <b>{tot.feedback}</b>
                </span>
              </div>
            </Panel>
          </div>
        </>
      ) : (
        <p className="mini-note pad">{t('Loading…')}</p>
      )}
      <Panel icon={Download} title={t('Export CSV')} sub={t('For the selected period; opens in Excel or Google Sheets')}>
        <div className="export-row">
          {EXPORTS.filter(([type]) => (type === 'audit' ? me.permissions.includes('audit.view') : true)).map(([type, label]) => (
            <button key={type} className="btn btn-ghost" onClick={() => csv(type, label)}>
              <Download size={15} /> {t(label)}
            </button>
          ))}
        </div>
      </Panel>
    </>
  );
}
