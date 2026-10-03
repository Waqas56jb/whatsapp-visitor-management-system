import { useState } from 'react';
import { Megaphone, Send } from 'lucide-react';
import api from '../../api/client';
import { useI18n } from '../../i18n';
import { act, Badge, Field, Panel, Toggle, notify, useApi } from '../../ui';

export default function Announcements() {
  const { t, formatDateTime } = useI18n();
  const { data, reload } = useApi('/platform/announcements');
  const [form, setForm] = useState({ title: '', body: '', severity: 'info', endsAt: '', email: false });

  async function publish() {
    if (!form.title.trim()) return notify.err(t('Please enter a title'));
    const res = await act(() => api.post('/platform/announcements', { ...form, endsAt: form.endsAt || null }), t('Announcement published'), t('Could not publish'));
    if (res) {
      if (form.email) {
        const email = res.data.email;
        if (!email.configured) notify.err(t('Email is not configured on the server, so only the banner was published.'));
        else notify.ok(t('Emailed to {count} company admins', { count: email.sent }));
      }
      setForm({ title: '', body: '', severity: 'info', endsAt: '', email: false });
      reload();
    }
  }

  async function end(id) {
    if (await act(() => api.post(`/platform/announcements/${id}/end`), t('Announcement ended'), t('Could not end the announcement'))) reload();
  }

  return (
    <>
      <Panel icon={Megaphone} title={t('New announcement')} sub={t('Shown as a banner in every company console (and optionally emailed to company admins).')}>
        <div className="form-grid">
          <Field label={t('Title')} span2>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t('e.g. Scheduled maintenance on Saturday')} />
          </Field>
          <Field label={t('Message')} span2>
            <textarea rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder={t('e.g. The system will be unavailable from 22:00 to 23:00.')} />
          </Field>
          <Field label={t('Severity')}>
            <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
              <option value="info">{t('Information')}</option>
              <option value="warning">{t('Warning')}</option>
              <option value="critical">{t('Critical')}</option>
            </select>
          </Field>
          <Field label={t('Show until (optional)')}>
            <input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
          </Field>
          <Field span2>
            <Toggle checked={form.email} onChange={(email) => setForm({ ...form, email })} label={data?.emailConfigured ? t('Also email every company admin') : t('Also email every company admin (email is not configured on the server)')} />
          </Field>
        </div>
        <div className="form-actions">
          <button className="btn btn-violet" onClick={publish}>
            <Send size={15} /> {t('Publish')}
          </button>
        </div>
      </Panel>
      <Panel icon={Megaphone} title={t('Announcements')} sub={t('Newest first')}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Announcement')}</th>
                <th>{t('Severity')}</th>
                <th>{t('Shown')}</th>
                <th>{t('Emailed')}</th>
                <th>{t('Status')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(data?.items || []).length ? (
                data.items.map((a) => (
                  <tr key={a.id}>
                    <td data-label={t('Announcement')}>
                      <div className="cell-main">{a.title}</div>
                      <div className="cell-sub">{a.body}</div>
                    </td>
                    <td data-label={t('Severity')}>
                      <span className={`tag tag-${a.severity}`}>{t(a.severity)}</span>
                    </td>
                    <td data-label={t('Shown')} className="nowrap">
                      {formatDateTime(a.startsAt)}
                      {a.endsAt ? ` → ${formatDateTime(a.endsAt)}` : ''}
                      <div className="cell-sub">{a.createdBy}</div>
                    </td>
                    <td data-label={t('Emailed')}>{a.emailed}</td>
                    <td data-label={t('Status')}>
                      <Badge status={a.live ? 'active' : 'closed'} label={a.live ? t('Live') : t('Ended')} />
                    </td>
                    <td data-label={t('Actions')}>
                      {a.live ? (
                        <button className="btn btn-sm btn-ghost" onClick={() => end(a.id)}>
                          {t('End now')}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="empty">
                    {t('No announcements yet')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
