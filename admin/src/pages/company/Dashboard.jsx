import { useState } from 'react';
import { AlertTriangle, CalendarDays, Check, ClipboardList, Clock, Headset, MapPin, MessageSquareHeart, Star, UserCheck, Wrench, X } from 'lucide-react';
import { useI18n } from '../../i18n';
import { Badge, EmptyRow, Panel, Stat, Stars, useApi } from '../../ui';
import { FlagTag, KindTag, loadVisit, useVisitActions, VisitModal } from './shared';

export default function Dashboard({ me, go }) {
  const { t, formatDate } = useI18n();
  const { data, reload } = useApi('/dashboard', { interval: 30000 });
  const { decide } = useVisitActions(reload);
  const [open, setOpen] = useState(null);
  const perms = new Set(me.permissions);
  if (!data) return <p className="mini-note pad">{t('Loading…')}</p>;
  const s = data.stats;
  const f = me.company.features;

  return (
    <>
      <div className="dash-hero">
        <div>
          <h3>{t('Welcome back, {name}', { name: me.name.split(' ')[0] })}</h3>
          <p>{t('Visitor traffic, approvals, feedback and service requests for {company}.', { company: me.company.name })}</p>
        </div>
        <div className="dash-hero-meta">
          <CalendarDays size={18} strokeWidth={1.9} />
          {formatDate(new Date(), { weekday: true })}
        </div>
      </div>
      <div className="stat-row">
        <Stat icon={Clock} tone="warn" label={t('Pending approvals')} value={s.pending} />
        <Stat icon={CalendarDays} label={t('Visits today')} value={s.today_visits} hint={t('{count} checked in', { count: s.checked_in_today })} />
        <Stat icon={MapPin} tone="ok" label={t('On site now')} value={s.on_site} />
        <Stat icon={UserCheck} tone="blue" label={t('Active hosts')} value={s.active_hosts} />
      </div>
      <div className="stat-row">
        {f.service_requests ? <Stat icon={Wrench} tone="blue" label={t('Open service requests')} value={s.open_requests} /> : null}
        {f.human_handover ? <Stat icon={Headset} tone="bad" label={t('Visitors waiting for staff')} value={s.open_handovers} /> : null}
        {f.feedback ? <Stat icon={Star} tone="warn" label={t('Average rating')} value={s.feedback_avg == null ? '—' : `${s.feedback_avg} / 5`} /> : null}
        <Stat icon={AlertTriangle} tone="bad" label={t('Flagged requests')} value={data.flagged.length} />
      </div>

      <div className="grid-2">
        <Panel icon={ClipboardList} title={t('Waiting for a decision')} sub={t('Hosts can also approve by replying 1 on WhatsApp')} actions={<button className="btn btn-ghost btn-sm" onClick={() => go('visits')}>{t('View all')}</button>}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('Visitor')}</th>
                  <th>{t('Host / when')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.pending.length ? (
                  data.pending.slice(0, 8).map((v) => (
                    <tr key={v.id}>
                      <td data-label={t('Visitor')}>
                        <button className="link-btn cell-main" onClick={async () => setOpen(await loadVisit(v.id))}>
                          {v.visitor}
                        </button>
                        <div className="cell-sub">
                          <KindTag v={v} /> <FlagTag v={v} />
                        </div>
                      </td>
                      <td data-label={t('Host / when')}>
                        <div>{v.host}</div>
                        <div className="cell-sub nowrap">
                          {formatDate(v.date)} · {v.time}
                        </div>
                      </td>
                      <td data-label={t('Actions')}>
                        {perms.has('visits.decide') ? (
                          <div className="row-actions nowrap-actions">
                            <button className="btn btn-sm btn-teal" onClick={() => decide(v.id, 'approved')} aria-label={t('Approve')}>
                              <Check size={13} strokeWidth={2.5} />
                            </button>
                            <button className="btn btn-sm btn-danger" onClick={() => decide(v.id, 'rejected')} aria-label={t('Decline')}>
                              <X size={13} strokeWidth={2.5} />
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow cols={3}>{t('Nothing is waiting for approval')}</EmptyRow>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel icon={CalendarDays} title={t("Today's schedule")} sub={t('Everyone expected today')}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('Time')}</th>
                  <th>{t('Visitor')}</th>
                  <th>{t('Host')}</th>
                  <th>{t('Status')}</th>
                </tr>
              </thead>
              <tbody>
                {data.today.length ? (
                  data.today.map((v) => (
                    <tr key={v.id}>
                      <td data-label={t('Time')} className="cell-main">
                        {v.time}
                      </td>
                      <td data-label={t('Visitor')}>{v.visitor}</td>
                      <td data-label={t('Host')}>{v.host}</td>
                      <td data-label={t('Status')}>
                        <Badge status={v.status} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow cols={4}>{t('No visits scheduled for today')}</EmptyRow>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="grid-2">
        {f.feedback ? (
          <Panel icon={MessageSquareHeart} title={t('Latest feedback')} actions={perms.has('feedback.view') ? <button className="btn btn-ghost btn-sm" onClick={() => go('feedback')}>{t('View all')}</button> : null}>
            <div className="feed">
              {data.recentFeedback.length ? (
                data.recentFeedback.map((fb) => (
                  <div className="feed-item" key={fb.id}>
                    <div>
                      <p>
                        <b>{fb.visitor || `+${fb.phone}`}</b> {fb.isComplaint ? <span className="flag-tag">{t('Complaint')}</span> : <Stars value={fb.rating} />}
                      </p>
                      <span>{fb.comment}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="mini-note pad">{t('No feedback yet')}</p>
              )}
            </div>
          </Panel>
        ) : null}
        {f.service_requests ? (
          <Panel icon={Wrench} title={t('Open service requests')} actions={perms.has('service.view') ? <button className="btn btn-ghost btn-sm" onClick={() => go('service')}>{t('View all')}</button> : null}>
            <div className="feed">
              {data.openRequests.length ? (
                data.openRequests.map((r) => (
                  <div className="feed-item" key={r.id}>
                    <div>
                      <p>
                        <b>{r.ref}</b> · {r.visitor || `+${r.phone}`} <span className={`tag tag-${r.priority}`}>{t(r.priority)}</span>
                      </p>
                      <span>{r.description}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="mini-note pad">{t('No open service requests')}</p>
              )}
            </div>
          </Panel>
        ) : null}
      </div>
      <VisitModal visit={open} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); reload(); }} canDecide={perms.has('visits.decide')} canFlag={perms.has('visits.flag')} />
    </>
  );
}
