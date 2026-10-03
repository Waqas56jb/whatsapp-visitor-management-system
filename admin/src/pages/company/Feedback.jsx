import { useState } from 'react';
import { MessageSquareHeart, PhoneCall, Star } from 'lucide-react';
import api from '../../api/client';
import { useI18n } from '../../i18n';
import { act, Badge, EmptyRow, Panel, SearchInput, Stat, Stars, matches, useApi } from '../../ui';

const TOPIC = { visit: 'Visit Experience', appointment: 'Appointment', service: 'Service', staff: 'Staff', general: 'General Feedback', complaint: 'Complaint' };

export default function Feedback({ me }) {
  const { t, formatDateTime } = useI18n();
  const { data, reload } = useApi('/feedback', { initial: [] });
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const canManage = me.permissions.includes('feedback.manage');
  const all = data || [];
  const rated = all.filter((f) => f.rating != null);
  const avg = rated.length ? (rated.reduce((s, f) => s + f.rating, 0) / rated.length).toFixed(1) : '—';
  const rows = all
    .filter((f) => filter === 'all' || (filter === 'complaints' ? f.isComplaint : filter === 'new' ? f.status === 'new' : !f.isComplaint))
    .filter((f) => matches(query, f.ref, f.visitor, f.phone, f.comment, f.topic));

  async function setStatus(f, status) {
    if (await act(() => api.patch(`/feedback/${f.id}`, { status }), t('Updated'), t('Could not update'))) reload();
  }

  return (
    <>
      <div className="stat-row three">
        <Stat icon={Star} tone="warn" label={t('Average rating')} value={avg === '—' ? avg : `${avg} / 5`} hint={t('{count} ratings', { count: rated.length })} />
        <Stat icon={MessageSquareHeart} label={t('Feedback received')} value={all.length} />
        <Stat icon={PhoneCall} tone="bad" label={t('Complaints waiting')} value={all.filter((f) => f.isComplaint && f.status !== 'resolved').length} />
      </div>
      <Panel
        icon={MessageSquareHeart}
        title={t('Feedback and complaints')}
        sub={t('Collected on WhatsApp, including after each visit')}
        actions={
          <>
            <SearchInput value={query} onChange={setQuery} />
            <select className="filter-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">{t('All')}</option>
              <option value="new">{t('New')}</option>
              <option value="complaints">{t('Complaints')}</option>
              <option value="feedback">{t('Feedback only')}</option>
            </select>
          </>
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Reference')}</th>
                <th>{t('From')}</th>
                <th>{t('About')}</th>
                <th>{t('Comment')}</th>
                <th>{t('Rating')}</th>
                <th>{t('Status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((f) => (
                  <tr key={f.id}>
                    <td data-label={t('Reference')} className="cell-main nowrap">
                      {f.ref}
                      <div className="cell-sub">{formatDateTime(f.createdAt)}</div>
                    </td>
                    <td data-label={t('From')}>
                      <div className="cell-main">{f.visitor || '—'}</div>
                      <div className="cell-sub">+{f.phone}</div>
                    </td>
                    <td data-label={t('About')}>
                      {f.isComplaint ? <span className="flag-tag">{t('Complaint')}</span> : t(TOPIC[f.topic] || f.topic)}
                      {f.contactRequested ? <div className="cell-sub bad-text">{t('Wants to be contacted')}</div> : null}
                    </td>
                    <td data-label={t('Comment')} className="wrap-cell">
                      {f.comment}
                    </td>
                    <td data-label={t('Rating')}>
                      <Stars value={f.rating} />
                    </td>
                    <td data-label={t('Status')}>
                      {canManage ? (
                        <select className="filter-select" value={f.status} onChange={(e) => setStatus(f, e.target.value)}>
                          <option value="new">{t('New')}</option>
                          <option value="reviewed">{t('Reviewed')}</option>
                          <option value="resolved">{t('Resolved')}</option>
                        </select>
                      ) : (
                        <Badge status={f.status} />
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <EmptyRow cols={6} icon={MessageSquareHeart}>
                  {t('No feedback yet')}
                </EmptyRow>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
