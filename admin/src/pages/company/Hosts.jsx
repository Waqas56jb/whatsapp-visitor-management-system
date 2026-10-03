import { useState } from 'react';
import { Pencil, Plus, Trash2, UserCheck } from 'lucide-react';
import api, { errorText } from '../../api/client';
import { useI18n } from '../../i18n';
import { act, Badge, EmptyRow, Field, Modal, notify, Panel, SearchInput, initials, matches, useApi } from '../../ui';

const EMPTY = { name: '', department: '', phone: '', office: '', email: '' };

export default function Hosts({ me }) {
  const { t } = useI18n();
  const { data, reload } = useApi('/hosts', { initial: [] });
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(null);
  const canManage = me.permissions.includes('hosts.manage');
  const rows = (data || []).filter((h) => matches(query, h.name, h.department, h.phone, h.office, h.email));

  async function save() {
    if (!form.name.trim() || !form.department.trim()) return notify.err(t('Please fill in the name and department'));
    try {
      if (form.id) await api.patch(`/hosts/${form.id}`, form);
      else await api.post('/hosts', form);
      setForm(null);
      reload();
      notify.ok(form.id ? t('Host updated') : t('Host added'));
    } catch (err) {
      notify.err(errorText(err, t('Could not save the host')));
    }
  }

  const setStatus = async (h, action) => (await act(() => api.patch(`/hosts/${h.id}/${action}`), action === 'block' ? t('Host deactivated') : t('Host reactivated'), t('Could not update the host'))) && reload();
  async function remove(h) {
    if (!window.confirm(t('Delete host {name}? This cannot be undone.', { name: h.name }))) return;
    if (await act(() => api.delete(`/hosts/${h.id}`, { data: { confirm: true } }), t('Host deleted'), t('Could not delete the host'))) reload();
  }

  return (
    <>
      <Panel
        icon={UserCheck}
        title={t('Hosts')}
        sub={t('Visitors can only book the active people on this list. Hosts approve requests by replying on their own WhatsApp.')}
        actions={
          <>
            <SearchInput value={query} onChange={setQuery} />
            {canManage ? (
              <button className="btn btn-violet btn-sm" onClick={() => setForm({ ...EMPTY })}>
                <Plus size={14} strokeWidth={2.4} /> {t('Add host')}
              </button>
            ) : null}
          </>
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Host')}</th>
                <th>{t('Department')}</th>
                <th>{t('Office')}</th>
                <th>{t('Personal WhatsApp')}</th>
                <th>{t('Status')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((h) => (
                  <tr key={h.id}>
                    <td data-label={t('Host')}>
                      <div className="row-flex">
                        <div className="avatar-sm">{initials(h.name)}</div>
                        <div>
                          <div className="cell-main">{h.name}</div>
                          {h.email ? <div className="cell-sub">{h.email}</div> : null}
                        </div>
                      </div>
                    </td>
                    <td data-label={t('Department')}>{h.department || '—'}</td>
                    <td data-label={t('Office')}>{h.office || '—'}</td>
                    <td data-label={t('Personal WhatsApp')} className="nowrap">
                      {h.phone ? `+${String(h.phone).replace(/\D/g, '')}` : <span className="muted">{t('none — no WhatsApp alerts')}</span>}
                    </td>
                    <td data-label={t('Status')}>
                      <Badge status={h.status} />
                    </td>
                    <td data-label={t('Actions')}>
                      {canManage ? (
                        <div className="row-actions">
                          <button className="btn btn-sm btn-ghost" onClick={() => setForm({ ...EMPTY, ...h })} aria-label={t('Edit')}>
                            <Pencil size={13} />
                          </button>
                          {h.status === 'active' ? (
                            <button className="btn btn-sm btn-ghost" onClick={() => setStatus(h, 'block')}>
                              {t('Deactivate')}
                            </button>
                          ) : (
                            <button className="btn btn-sm btn-ghost" onClick={() => setStatus(h, 'unblock')}>
                              {t('Reactivate')}
                            </button>
                          )}
                          <button className="btn btn-sm btn-danger" onClick={() => remove(h)} aria-label={t('Delete')}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))
              ) : (
                <EmptyRow cols={6} icon={UserCheck}>
                  {t('No hosts added yet')}
                </EmptyRow>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
      <Modal
        open={Boolean(form)}
        title={form?.id ? t('Edit host') : t('Add a host')}
        onClose={() => setForm(null)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setForm(null)}>
              {t('Cancel')}
            </button>
            <button className="btn btn-violet" onClick={save}>
              {form?.id ? t('Save') : t('Add host')}
            </button>
          </>
        }
      >
        {form ? (
          <div className="form-grid full">
            <Field label={t('Full name')}>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Smith" />
            </Field>
            <Field label={t('Department')}>
              <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Human Resources" />
            </Field>
            <Field label={t('Office / location')} hint={t('Shown to visitors when they confirm the host')}>
              <input value={form.office} onChange={(e) => setForm({ ...form, office: e.target.value })} placeholder="Block A, 2nd floor" />
            </Field>
            <Field label={t('Personal WhatsApp')} hint={t('New requests and arrival alerts go here; the host replies 1 or 2 to approve or decline')}>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+267 71 000 000" />
            </Field>
            <Field label={t('Email')}>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
