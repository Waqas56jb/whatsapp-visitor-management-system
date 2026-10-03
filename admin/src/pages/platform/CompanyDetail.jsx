import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, Download, Gauge, KeyRound, Layers, LogIn, PauseCircle, PlayCircle, Plus, ShieldOff, Trash2, UserCog } from 'lucide-react';
import api, { blobError, download, errorText, startImpersonation } from '../../api/client';
import { useI18n } from '../../i18n';
import { act, Badge, Field, Meter, Modal, notify, Panel, SecretModal, TypedConfirm, fmtMoney, useApi } from '../../ui';

const UNIT = { storage_mb: ' MB' };

export default function CompanyDetail({ me, go, params, refreshMe }) {
  const { t, formatDateTime } = useI18n();
  const id = params.id;
  const { data: c, reload } = useApi(id ? `/platform/companies/${id}` : null);
  const { data: catalog } = useApi('/platform/plans');
  const [profile, setProfile] = useState(null);
  const [plan, setPlan] = useState('');
  const [features, setFeatures] = useState({});
  const [limits, setLimits] = useState({});
  const [modal, setModal] = useState(null);
  const [reason, setReason] = useState('');
  const [adminForm, setAdminForm] = useState({ name: '', username: '', email: '' });
  const [secret, setSecret] = useState(null);
  const perms = new Set(me.permissions);
  const canManage = perms.has('platform.companies.manage');
  const canPlans = perms.has('platform.plans.manage');
  const canImpersonate = perms.has('platform.impersonate');

  useEffect(() => {
    if (!c) return;
    setProfile({ name: c.name, registrationNumber: c.registrationNumber, domain: c.domain });
    setPlan(c.plan);
    setFeatures(c.overrides?.features || {});
    const l = {};
    for (const [k, v] of Object.entries(c.overrides?.limits || {})) l[k] = v === null ? 'unlimited' : String(v);
    setLimits(l);
  }, [c]);

  if (!id) return <p className="mini-note pad">{t('Choose a company from the list.')}</p>;
  if (!c || !profile) return <p className="mini-note pad">{t('Loading…')}</p>;

  const planInfo = catalog?.plans?.find((p) => p.key === plan);
  const planHas = (key) => Boolean(planInfo?.features?.includes(key));

  async function saveProfile() {
    if (await act(() => api.patch(`/platform/companies/${id}`, profile), t('Company profile saved'), t('Could not save the profile'))) reload();
  }

  async function saveSubscription() {
    const limitOverrides = {};
    for (const [k, v] of Object.entries(limits)) {
      if (v === '' || v === undefined) continue;
      limitOverrides[k] = v === 'unlimited' ? null : Number(v);
    }
    const body = { plan, overrides: { features, limits: limitOverrides } };
    if (await act(() => api.patch(`/platform/companies/${id}/subscription`, body), t('Subscription saved'), t('Could not save the subscription'))) reload();
  }

  async function setStatus(status, extra = {}) {
    const ok = await act(() => api.post(`/platform/companies/${id}/status`, { status, ...extra }), t('Company status updated'), t('Could not change the status'));
    if (ok) {
      setModal(null);
      setReason('');
      reload();
    }
  }

  async function remove(confirmName) {
    const ok = await act(() => api.delete(`/platform/companies/${id}`, { data: { confirmName } }), t('Company deleted'), t('Could not delete the company'));
    if (ok) go('p-companies');
  }

  async function impersonate() {
    try {
      const { data } = await api.post(`/platform/companies/${id}/impersonate`);
      startImpersonation(data.token);
      notify.ok(t('Signed in to {company} for {minutes} minutes', { company: data.company.name, minutes: data.expiresInMinutes }));
      await refreshMe();
    } catch (err) {
      notify.err(errorText(err, t('Could not sign in to this company')));
    }
  }

  async function exportData() {
    try {
      await download(`/platform/companies/${id}/export`, `company-${id}-export.json`);
      notify.ok(t('Export downloaded'));
    } catch (err) {
      notify.err(await blobError(err, t('Could not export the data')));
    }
  }

  async function appointAdmin() {
    try {
      const { data } = await api.post(`/platform/companies/${id}/admins`, adminForm);
      setModal(null);
      setAdminForm({ name: '', username: '', email: '' });
      reload();
      setSecret({ title: t('New company admin'), username: data.admin.username, password: data.password, url: window.location.origin });
    } catch (err) {
      notify.err(errorText(err, t('Could not appoint the admin')));
    }
  }

  async function resetAdmin(admin) {
    if (!window.confirm(t('Generate a new password for {name}? Their current sessions will end.', { name: admin.name }))) return;
    try {
      const { data } = await api.post(`/platform/companies/${id}/admins/${admin.id}/password`, {});
      setSecret({ title: t('New password for {name}', { name: admin.name }), username: admin.username, password: data.password, url: window.location.origin });
    } catch (err) {
      notify.err(errorText(err, t('Could not reset the password')));
    }
  }

  async function toggleAdmin(admin) {
    const status = admin.status === 'blocked' ? 'active' : 'blocked';
    if (await act(() => api.patch(`/platform/companies/${id}/admins/${admin.id}`, { status }), status === 'blocked' ? t('Login blocked') : t('Login unblocked'), t('Could not update the login'))) reload();
  }

  const featureState = (key) => (key in features ? (features[key] ? 'on' : 'off') : 'plan');
  function setFeatureState(key, value) {
    setFeatures((f) => {
      const next = { ...f };
      if (value === 'plan') delete next[key];
      else next[key] = value === 'on';
      return next;
    });
  }

  return (
    <>
      <div className="page-actions">
        <button className="btn btn-ghost btn-sm" onClick={() => go('p-companies')}>
          <ArrowLeft size={14} /> {t('All companies')}
        </button>
        <div className="head-actions">
          {canImpersonate && c.status !== 'terminated' ? (
            <button className="btn btn-teal btn-sm" onClick={impersonate}>
              <LogIn size={14} /> {t('Log in as company admin')}
            </button>
          ) : null}
          {canManage ? (
            <button className="btn btn-ghost btn-sm" onClick={exportData}>
              <Download size={14} /> {t('Export data')}
            </button>
          ) : null}
        </div>
      </div>

      <div className="company-head panel">
        <div>
          <h2>{c.name}</h2>
          <p>
            {[c.domain, c.registrationNumber, t('created {date}', { date: c.created })].filter(Boolean).join(' · ')}
          </p>
          {c.statusReason ? <p className="mini-note flush">{t('Reason: {reason}', { reason: c.statusReason })}</p> : null}
        </div>
        <div className="company-head-tags">
          <Badge status={c.status} />
          <span className="tag tag-violet">{t(c.planName)}</span>
          <Badge status={c.whatsapp} label={c.whatsapp === 'connected' && c.whatsappPhone ? `WhatsApp +${c.whatsappPhone}` : undefined} />
        </div>
      </div>

      <div className="grid-2">
        <Panel icon={Building2} title={t('Company profile')} sub={t('Legal details of the client company')}>
          <div className="form-grid">
            <Field label={t('Company name')} span2>
              <input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} disabled={!canManage} />
            </Field>
            <Field label={t('Registration number')}>
              <input value={profile.registrationNumber} onChange={(e) => setProfile({ ...profile, registrationNumber: e.target.value })} disabled={!canManage} />
            </Field>
            <Field label={t('Domain')}>
              <input value={profile.domain} onChange={(e) => setProfile({ ...profile, domain: e.target.value })} disabled={!canManage} />
            </Field>
            <Field label={t('Contact')} span2>
              <input value={[c.contact.phone, c.contact.email, c.contact.address].filter(Boolean).join(' · ') || '—'} disabled readOnly />
            </Field>
          </div>
          {canManage ? (
            <div className="form-actions">
              <button className="btn btn-violet" onClick={saveProfile}>
                {t('Save profile')}
              </button>
            </div>
          ) : null}
        </Panel>

        <Panel icon={Gauge} title={t('Usage this month')} sub={t('Against the plan limits')}>
          <div className="meters">
            {Object.entries(c.usage).map(([key, u]) => (
              <Meter key={key} label={t(u.label)} used={u.used} limit={u.limit} unit={UNIT[key] || ''} />
            ))}
          </div>
        </Panel>
      </div>

      <Panel
        icon={Layers}
        title={t('Subscription and feature restrictions')}
        sub={t('Choose the plan, then optionally switch individual features on or off and change limits for this company only.')}
        actions={
          canPlans ? (
            <button className="btn btn-violet btn-sm" onClick={saveSubscription}>
              {t('Save subscription')}
            </button>
          ) : null
        }
      >
        <div className="form-grid">
          <Field label={t('Plan')} span2>
            <select value={plan} onChange={(e) => setPlan(e.target.value)} disabled={!canPlans}>
              {(catalog?.plans || []).map((p) => (
                <option key={p.key} value={p.key}>
                  {t(p.name)} — {fmtMoney(p.price, p.currency)} / {t('month')}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="feature-grid">
          {Object.entries(catalog?.features || {}).map(([key, label]) => {
            const state = featureState(key);
            const effective = state === 'plan' ? planHas(key) : state === 'on';
            return (
              <div className="feature-row" key={key}>
                <div>
                  <b>{t(label)}</b>
                  <span className={effective ? 'ok-text' : 'muted'}>{effective ? t('Included') : t('Not included')}</span>
                </div>
                <select className="filter-select" value={state} onChange={(e) => setFeatureState(key, e.target.value)} disabled={!canPlans}>
                  <option value="plan">{t('As plan ({value})', { value: planHas(key) ? t('on') : t('off') })}</option>
                  <option value="on">{t('Always on')}</option>
                  <option value="off">{t('Always off')}</option>
                </select>
              </div>
            );
          })}
        </div>
        <h4 className="form-section">{t('Limits')}</h4>
        <div className="form-grid three">
          {Object.entries(catalog?.limits || {}).map(([key, label]) => {
            const planLimit = planInfo?.limits?.[key];
            return (
              <Field key={key} label={t(label)} hint={t('Plan: {value}', { value: planLimit == null ? t('unlimited') : planLimit })}>
                <input
                  value={limits[key] ?? ''}
                  onChange={(e) => setLimits({ ...limits, [key]: e.target.value.replace(/[^0-9a-z]/gi, '') })}
                  placeholder={t('As plan')}
                  disabled={!canPlans}
                  list="limit-options"
                />
              </Field>
            );
          })}
          <datalist id="limit-options">
            <option value="unlimited" />
          </datalist>
        </div>
      </Panel>

      <Panel
        icon={UserCog}
        title={t('Company admins and staff')}
        sub={t('The company admin manages the company. Appoint another, reset a password, or block a login.')}
        actions={
          canManage ? (
            <button className="btn btn-violet btn-sm" onClick={() => setModal('admin')}>
              <Plus size={14} /> {t('Appoint company admin')}
            </button>
          ) : null
        }
      >
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
              {c.admins.map((a) => (
                <tr key={a.id}>
                  <td data-label={t('Name')}>
                    <div className="cell-main">{a.name}</div>
                    {a.email ? <div className="cell-sub">{a.email}</div> : null}
                  </td>
                  <td data-label={t('Username')} className="mono">
                    {a.username}
                  </td>
                  <td data-label={t('Role')}>{t(a.roleLabel)}</td>
                  <td data-label={t('Status')}>
                    <Badge status={a.status} />
                  </td>
                  <td data-label={t('Actions')}>
                    {canManage ? (
                      <div className="row-actions">
                        <button className="btn btn-sm btn-ghost" onClick={() => resetAdmin(a)}>
                          <KeyRound size={13} /> {t('New password')}
                        </button>
                        <button className="btn btn-sm btn-ghost" onClick={() => toggleAdmin(a)}>
                          {a.status === 'blocked' ? t('Unblock') : t('Block')}
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {canManage ? (
        <Panel icon={ShieldOff} title={t('Lifecycle')} sub={t('Suspend blocks the company’s logins and pauses its WhatsApp assistant. Terminate ends the service. Delete removes all data permanently.')}>
          <div className="lifecycle">
            {c.status === 'active' ? (
              <button className="btn btn-ghost" onClick={() => setModal('suspend')}>
                <PauseCircle size={15} /> {t('Suspend')}
              </button>
            ) : null}
            {c.status === 'suspended' ? (
              <button className="btn btn-teal" onClick={() => setStatus('active')}>
                <PlayCircle size={15} /> {t('Reactivate')}
              </button>
            ) : null}
            {c.status !== 'terminated' ? (
              <button className="btn btn-danger" onClick={() => setModal('terminate')}>
                <ShieldOff size={15} /> {t('Terminate')}
              </button>
            ) : null}
            {c.status !== 'active' ? (
              <button className="btn btn-danger" onClick={() => setModal('delete')}>
                <Trash2 size={15} /> {t('Delete permanently')}
              </button>
            ) : null}
          </div>
          {c.platformEvents.length ? (
            <div className="feed">
              {c.platformEvents.map((e, i) => (
                <div className="feed-item" key={i}>
                  <div>
                    <p>
                      <b>{e.actor}</b> — {t(e.action)}
                    </p>
                    <span>
                      {formatDateTime(e.time)} · {e.details}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </Panel>
      ) : null}

      <Modal
        open={modal === 'suspend'}
        title={t('Suspend {company}', { company: c.name })}
        onClose={() => setModal(null)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>
              {t('Cancel')}
            </button>
            <button className="btn btn-danger" disabled={!reason.trim()} onClick={() => setStatus('suspended', { reason })}>
              {t('Suspend')}
            </button>
          </>
        }
      >
        <div className="modal-body">
          <p className="mini-note flush">{t('The company’s staff cannot sign in and its WhatsApp assistant stops answering until you reactivate it. No data is deleted.')}</p>
          <Field label={t('Reason (shown to the company)')}>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('e.g. Invoice overdue')} autoFocus />
          </Field>
        </div>
      </Modal>

      <TypedConfirm
        open={modal === 'terminate'}
        title={t('Terminate {company}', { company: c.name })}
        message={t('Termination ends the service: logins are blocked and the WhatsApp number is unlinked. Data is kept until you delete the company. This cannot be undone.')}
        expected={c.name}
        actionLabel={t('Terminate')}
        onClose={() => setModal(null)}
        onConfirm={(confirmName) => setStatus('terminated', { confirmName, reason: 'Terminated by the platform' })}
      />
      <TypedConfirm
        open={modal === 'delete'}
        title={t('Delete {company}', { company: c.name })}
        message={t('Every host, visitor, visit, conversation, file and login of this company will be deleted permanently. Export the data first if you need it.')}
        expected={c.name}
        actionLabel={t('Delete permanently')}
        onClose={() => setModal(null)}
        onConfirm={remove}
      />
      <Modal
        open={modal === 'admin'}
        title={t('Appoint company admin')}
        onClose={() => setModal(null)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>
              {t('Cancel')}
            </button>
            <button className="btn btn-violet" onClick={appointAdmin}>
              {t('Appoint')}
            </button>
          </>
        }
      >
        <div className="form-grid full">
          <Field label={t('Full name')}>
            <input value={adminForm.name} onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })} />
          </Field>
          <Field label={t('Username')}>
            <input value={adminForm.username} onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })} autoComplete="off" />
          </Field>
          <Field label={t('Email')}>
            <input type="email" value={adminForm.email} onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })} />
          </Field>
        </div>
      </Modal>
      <SecretModal secret={secret} onClose={() => setSecret(null)} />
    </>
  );
}
