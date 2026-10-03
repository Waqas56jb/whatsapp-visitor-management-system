import { useState } from 'react';
import { Paperclip, Wrench } from 'lucide-react';
import api, { errorText, openFile } from '../../api/client';
import { useI18n } from '../../i18n';
import { act, Badge, EmptyRow, Field, Modal, notify, Panel, SearchInput, matches, useApi } from '../../ui';

const CATEGORY = { it_support: 'IT Support', technical: 'Technical Assistance', account_billing: 'Account / Billing', document: 'Document Request', maintenance: 'Maintenance', other: 'Other' };
const PRIORITY = { low: 'Low', normal: 'Normal', high: 'High', critical: 'Critical' };

export default function ServiceRequests({ me }) {
  const { t, formatDateTime } = useI18n();
  const { data, reload } = useApi('/service-requests', { initial: [], interval: 30000 });
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('open_all');
  const [edit, setEdit] = useState(null);
  const canManage = me.permissions.includes('service.manage');
  const rows = (data || [])
    .filter((r) => status === 'all' || (status === 'open_all' ? ['open', 'in_progress'].includes(r.status) : r.status === status))
    .filter((r) => matches(query, r.ref, r.visitor, r.phone, r.description, r.category));

  async function save() {
    const res = await act(() => api.patch(`/service-requests/${edit.id}`, { status: edit.status, priority: edit.priority, staffNote: edit.staffNote }), null, t('Could not update the request'));
    if (res) {
      notify.ok(res.data.visitorNotified ? t('Saved — the visitor was told on WhatsApp') : t('Saved'));
      setEdit(null);
      reload();
    }
  }

  return (
    <>
      <Panel
        icon={Wrench}
        title={t('Service requests')}
        sub={t('Tickets raised on WhatsApp. Changing the status tells the visitor.')}
        actions={
          <>
            <SearchInput value={query} onChange={setQuery} />
            <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="open_all">{t('Open and in progress')}</option>
              <option value="all">{t('All')}</option>
              <option value="open">{t('Open')}</option>
              <option value="in_progress">{t('In progress')}</option>
              <option value="resolved">{t('Resolved')}</option>
              <option value="closed">{t('Closed')}</option>
            </select>
          </>
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Ticket')}</th>
                <th>{t('From')}</th>
                <th>{t('Type')}</th>
                <th>{t('Details')}</th>
                <th>{t('Priority')}</th>
                <th>{t('Status')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td data-label={t('Ticket')} className="cell-main nowrap">
                      {r.ref}
                      <div className="cell-sub">{formatDateTime(r.createdAt)}</div>
                    </td>
                    <td data-label={t('From')}>
                      <div className="cell-main">{r.visitor || '—'}</div>
                      <div className="cell-sub">+{r.phone}</div>
                    </td>
                    <td data-label={t('Type')}>{t(CATEGORY[r.category] || r.category)}</td>
                    <td data-label={t('Details')} className="wrap-cell">
                      {r.description}
                      {r.staffNote ? <div className="cell-sub">{t('Note')}: {r.staffNote}</div> : null}
                    </td>
                    <td data-label={t('Priority')}>
                      <span className={`tag tag-${r.priority}`}>{t(PRIORITY[r.priority] || r.priority)}</span>
                    </td>
                    <td data-label={t('Status')}>
                      <Badge status={r.status} />
                    </td>
                    <td data-label={t('Actions')}>
                      <div className="row-actions">
                        {r.attachmentId ? (
                          <button className="btn btn-sm btn-ghost" onClick={() => openFile(`/documents/${r.attachmentId}`).catch((err) => notify.err(errorText(err, t('Could not open the file'))))}>
                            <Paperclip size={13} />
                          </button>
                        ) : null}
                        {canManage ? (
                          <button className="btn btn-sm btn-violet" onClick={() => setEdit({ ...r })}>
                            {t('Update')}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <EmptyRow cols={7} icon={Wrench}>
                  {t('No service requests')}
                </EmptyRow>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
      <Modal
        open={Boolean(edit)}
        title={edit ? `${edit.ref} — ${t(CATEGORY[edit.category] || edit.category)}` : ''}
        onClose={() => setEdit(null)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setEdit(null)}>
              {t('Cancel')}
            </button>
            <button className="btn btn-violet" onClick={save}>
              {t('Save')}
            </button>
          </>
        }
      >
        {edit ? (
          <div className="form-grid full">
            <p className="mini-note flush">{edit.description}</p>
            <Field label={t('Status')}>
              <select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                <option value="open">{t('Open')}</option>
                <option value="in_progress">{t('In progress')}</option>
                <option value="resolved">{t('Resolved')}</option>
                <option value="closed">{t('Closed')}</option>
              </select>
            </Field>
            <Field label={t('Priority')}>
              <select value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value })}>
                {Object.entries(PRIORITY).map(([k, v]) => (
                  <option key={k} value={k}>
                    {t(v)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('Note to the visitor (sent with a status change)')}>
              <textarea rows={3} value={edit.staffNote} onChange={(e) => setEdit({ ...edit, staffNote: e.target.value })} />
            </Field>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
