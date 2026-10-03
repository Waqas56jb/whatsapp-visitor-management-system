import { useState } from 'react';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import api, { errorText } from '../../api/client';
import { useI18n } from '../../i18n';
import { act, Badge, EmptyRow, Field, Modal, notify, Panel, SecretModal, useApi } from '../../ui';

const ROLES = [
  { key: 'super_admin', label: 'Super admin', desc: 'Everything on the platform' },
  { key: 'platform_support', label: 'Support (Tier 1)', desc: 'Companies (view), system health, announcements, “Log in as”' },
  { key: 'platform_billing', label: 'Billing auditor', desc: 'Companies (view), metering and billing' },
];

export default function Team({ me }) {
  const { t } = useI18n();
  const { data, reload } = useApi('/platform/team', { initial: [] });
  const [form, setForm] = useState(null);
  const [secret, setSecret] = useState(null);

  async function create() {
    try {
      const { data: res } = await api.post('/platform/team', form);
      setForm(null);
      reload();
      setSecret({ title: t('New platform team member'), username: res.login.username, password: res.password, url: window.location.origin });
    } catch (err) {
      notify.err(errorText(err, t('Could not add this person')));
    }
  }

  const changeRole = async (id, role) => (await act(() => api.patch(`/platform/team/${id}/role`, { role }), t('Role updated'), t('Could not change the role'))) && reload();
  const setStatus = async (id, status) => (await act(() => api.patch(`/platform/team/${id}/status`, { status }), t('Login updated'), t('Could not update the login'))) && reload();
  async function remove(u) {
    if (!window.confirm(t('Remove {name} from the platform team? This cannot be undone.', { name: u.name }))) return;
    if (await act(() => api.delete(`/platform/team/${u.id}`, { data: { confirm: true } }), t('Removed'), t('Could not remove'))) reload();
  }
  async function reset(u) {
    if (!window.confirm(t('Generate a new password for {name}? Their current sessions will end.', { name: u.name }))) return;
    try {
      const { data: res } = await api.post(`/platform/team/${u.id}/password`, {});
      setSecret({ title: t('New password for {name}', { name: u.name }), username: u.username, password: res.password });
    } catch (err) {
      notify.err(errorText(err, t('Could not reset the password')));
    }
  }

  return (
    <>
      <Panel
        icon={KeyRound}
        title={t('Platform team')}
        sub={t('People who run the platform. They never see a company’s daily operations unless they use “Log in as”, which is audited.')}
        actions={
          <button className="btn btn-violet btn-sm" onClick={() => setForm({ name: '', username: '', email: '', role: 'platform_support' })}>
            <Plus size={14} /> {t('Add team member')}
          </button>
        }
      >
        <div className="role-legend">
          {ROLES.map((r) => (
            <div key={r.key}>
              <b>{t(r.label)}</b>
              <span>{t(r.desc)}</span>
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
              {data?.length ? (
                data.map((u) => {
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
                        <select className="filter-select" value={u.role} disabled={self} onChange={(e) => changeRole(u.id, e.target.value)}>
                          {ROLES.map((r) => (
                            <option key={r.key} value={r.key}>
                              {t(r.label)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td data-label={t('Status')}>
                        <Badge status={u.status} />
                      </td>
                      <td data-label={t('Actions')}>
                        {!self ? (
                          <div className="row-actions">
                            <button className="btn btn-sm btn-ghost" onClick={() => reset(u)}>
                              {t('New password')}
                            </button>
                            <button className="btn btn-sm btn-ghost" onClick={() => setStatus(u.id, u.status === 'blocked' ? 'active' : 'blocked')}>
                              {u.status === 'blocked' ? t('Unblock') : t('Block')}
                            </button>
                            <button className="btn btn-sm btn-danger" onClick={() => remove(u)} aria-label={t('Remove')}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <EmptyRow cols={5}>{t('No team members yet')}</EmptyRow>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
      <Modal
        open={Boolean(form)}
        title={t('Add team member')}
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
            <Field label={t('Role')}>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map((r) => (
                  <option key={r.key} value={r.key}>
                    {t(r.label)} — {t(r.desc)}
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
