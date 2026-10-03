import { useState } from 'react';
import { Plus, Trash2, UserCog } from 'lucide-react';
import api, { errorText } from '../../api/client';
import { useI18n } from '../../i18n';
import { act, Badge, EmptyRow, Field, Modal, notify, Panel, SecretModal, useApi } from '../../ui';

const ROLE_INFO = {
  company_admin: 'Everything in this company: staff, settings, WhatsApp, rules, plus all daily operations',
  company_manager: 'Daily operations: visits, approvals, gate, conversations, feedback, service requests, hosts, knowledge, reports',
  company_hr: 'Host directory only: add, edit and deactivate hosts',
  company_security: 'Gate only: scan passes, check visitors in and out, see who is expected',
};

export default function Staff({ me }) {
  const { t } = useI18n();
  const { data, reload } = useApi('/staff', { initial: { staff: [], roles: [] } });
  const [form, setForm] = useState(null);
  const [secret, setSecret] = useState(null);
  const roles = data?.roles || [];

  async function create() {
    try {
      const { data: res } = await api.post('/staff', form);
      setForm(null);
      reload();
      setSecret({ title: t('New staff login'), username: res.login.username, password: res.password, url: window.location.origin });
    } catch (err) {
      notify.err(errorText(err, t('Could not add this person')));
    }
  }

  const update = async (id, body, ok) => (await act(() => api.patch(`/staff/${id}`, body), ok, t('Could not update the login'))) && reload();
  async function remove(u) {
    if (!window.confirm(t('Delete the login of {name}? This cannot be undone.', { name: u.name }))) return;
    if (await act(() => api.delete(`/staff/${u.id}`, { data: { confirm: true } }), t('Login deleted'), t('Could not delete the login'))) reload();
  }
  async function reset(u) {
    if (!window.confirm(t('Generate a new password for {name}? Their current sessions will end.', { name: u.name }))) return;
    try {
      const { data: res } = await api.post(`/staff/${u.id}/password`, {});
      setSecret({ title: t('New password for {name}', { name: u.name }), username: u.username, password: res.password });
    } catch (err) {
      notify.err(errorText(err, t('Could not reset the password')));
    }
  }

  return (
    <>
      <Panel
        icon={UserCog}
        title={t('Staff & roles')}
        sub={t('Give each person only the access they need. Deactivated staff cannot sign in.')}
        actions={
          <button className="btn btn-violet btn-sm" onClick={() => setForm({ name: '', username: '', email: '', role: 'company_security' })}>
            <Plus size={14} /> {t('Add staff')}
          </button>
        }
      >
        <div className="role-legend">
          {roles.map((r) => (
            <div key={r.key}>
              <b>{t(r.label)}</b>
              <span>{t(ROLE_INFO[r.key] || '')}</span>
            </div>
          ))}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Name')}</th>
                <th>{t('Username')}</th>
                <th>{t('Role')}</th>
                <th>{t('Status')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data?.staff?.length ? (
                data.staff.map((u) => {
                  const self = u.username === me.username;
                  return (
                    <tr key={u.id}>
                      <td data-label={t('Name')}>
                        <div className="cell-main">
                          {u.name} {self ? <span className="tag tag-violet">{t('you')}</span> : null}
                        </div>
                        <div className="cell-sub">{u.email || u.created}</div>
                      </td>
                      <td data-label={t('Username')} className="mono">
                        {u.username}
                      </td>
                      <td data-label={t('Role')}>
                        <select className="filter-select" value={u.role} disabled={self} onChange={(e) => update(u.id, { role: e.target.value }, t('Role updated'))}>
                          {roles.map((r) => (
                            <option key={r.key} value={r.key}>
                              {t(r.label)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td data-label={t('Status')}>
                        <Badge status={u.status} label={u.status === 'blocked' ? t('Deactivated') : undefined} />
                      </td>
                      <td data-label={t('Actions')}>
                        {!self ? (
                          <div className="row-actions">
                            <button className="btn btn-sm btn-ghost" onClick={() => reset(u)}>
                              {t('New password')}
                            </button>
                            <button
                              className="btn btn-sm btn-ghost"
                              onClick={() => update(u.id, { status: u.status === 'blocked' ? 'active' : 'blocked' }, u.status === 'blocked' ? t('Reactivated') : t('Deactivated'))}
                            >
                              {u.status === 'blocked' ? t('Reactivate') : t('Deactivate')}
                            </button>
                            <button className="btn btn-sm btn-danger" onClick={() => remove(u)} aria-label={t('Delete')}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <EmptyRow cols={5}>{t('No staff yet')}</EmptyRow>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
      <Modal
        open={Boolean(form)}
        title={t('Add staff')}
        onClose={() => setForm(null)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setForm(null)}>
              {t('Cancel')}
            </button>
            <button className="btn btn-violet" onClick={create}>
              {t('Add')}
            </button>
          </>
        }
      >
        {form ? (
          <div className="form-grid full">
            <Field label={t('Full name')}>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label={t('Username')}>
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" />
            </Field>
            <Field label={t('Email')}>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label={t('Role')} hint={t(ROLE_INFO[form.role] || '')}>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {roles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {t(r.label)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : null}
      </Modal>
      <SecretModal secret={secret} onClose={() => setSecret(null)} />
    </>
  );
}
