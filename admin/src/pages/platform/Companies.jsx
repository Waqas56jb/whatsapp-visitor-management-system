import { useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import api, { errorText } from '../../api/client';
import { useI18n } from '../../i18n';
import { Badge, EmptyRow, Field, Modal, Panel, SearchInput, SecretModal, fmtMoney, fmtNumber, matches, notify, useApi } from '../../ui';

const EMPTY = { name: '', registrationNumber: '', domain: '', plan: 'starter', contactPhone: '', adminName: '', adminUsername: '', adminEmail: '' };

export default function Companies({ me, go }) {
  const { t } = useI18n();
  const { data, reload } = useApi('/platform/companies', { initial: [] });
  const { data: plans } = useApi('/platform/plans');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState(null);
  const canManage = me.permissions.includes('platform.companies.manage');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function create() {
    if (!form.name.trim() || !form.adminName.trim() || !form.adminUsername.trim()) return notify.err(t('Please fill in the company name and the company admin’s name and username'));
    setBusy(true);
    try {
      const { data: res } = await api.post('/platform/companies', {
        name: form.name,
        registrationNumber: form.registrationNumber,
        domain: form.domain,
        plan: form.plan,
        contactPhone: form.contactPhone,
        contactEmail: form.adminEmail,
        admin: { name: form.adminName, username: form.adminUsername, email: form.adminEmail },
      });
      setForm(null);
      reload();
      notify.ok(t('Company created'));
      setSecret({ title: t('Company admin for {company}', { company: res.company.name }), username: res.admin.username, password: res.password, url: window.location.origin });
    } catch (err) {
      notify.err(errorText(err, t('Could not create the company')));
    } finally {
      setBusy(false);
    }
  }

  const rows = (data || []).filter((c) => (status === 'all' || c.status === status) && matches(query, c.name, c.domain, c.registrationNumber, c.planName));

  return (
    <>
      <Panel
        icon={Building2}
        title={t('Client companies')}
        sub={t('{count} companies on the platform', { count: (data || []).length })}
        actions={
          <>
            <SearchInput value={query} onChange={setQuery} placeholder={t('Search companies…')} />
            <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('Filter by status')}>
              <option value="all">{t('All statuses')}</option>
              <option value="active">{t('Active')}</option>
              <option value="suspended">{t('Suspended')}</option>
              <option value="terminated">{t('Terminated')}</option>
            </select>
            {canManage ? (
              <button className="btn btn-violet btn-sm" onClick={() => setForm({ ...EMPTY })}>
                <Plus size={14} strokeWidth={2.4} /> {t('New company')}
              </button>
            ) : null}
          </>
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Company')}</th>
                <th>{t('Plan')}</th>
                <th>{t('Hosts')}</th>
                <th>{t('Staff')}</th>
                <th>{t('Visits')}</th>
                <th>{t('WhatsApp')}</th>
                <th>{t('Status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => go('p-company', { id: c.id })}>
                    <td data-label={t('Company')}>
                      <div className="cell-main">{c.name}</div>
                      <div className="cell-sub">
                        {[c.domain, c.registrationNumber, t('since {date}', { date: c.created })].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td data-label={t('Plan')}>
                      <div className="cell-main">{t(c.planName)}</div>
                      <div className="cell-sub">
                        {fmtMoney(c.price, c.currency)} / {t('month')}
                        {c.hasOverrides ? ` · ${t('custom')}` : ''}
                      </div>
                    </td>
                    <td data-label={t('Hosts')}>{fmtNumber(c.hosts)}</td>
                    <td data-label={t('Staff')}>{fmtNumber(c.staff)}</td>
                    <td data-label={t('Visits')}>{fmtNumber(c.visits)}</td>
                    <td data-label={t('WhatsApp')}>
                      <Badge status={c.whatsapp} label={c.whatsapp === 'connected' && c.whatsappPhone ? `+${c.whatsappPhone}` : undefined} />
                    </td>
                    <td data-label={t('Status')}>
                      <Badge status={c.status} />
                    </td>
                  </tr>
                ))
              ) : (
                <EmptyRow cols={7} icon={Building2}>
                  {query ? t('No results for "{query}"', { query }) : t('No companies yet')}
                </EmptyRow>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Modal
        open={Boolean(form)}
        wide
        title={t('New company')}
        onClose={() => setForm(null)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setForm(null)}>
              {t('Cancel')}
            </button>
            <button className="btn btn-violet" onClick={create} disabled={busy}>
              {busy ? t('Creating…') : t('Create company')}
            </button>
          </>
        }
      >
        {form ? (
          <>
            <h4 className="form-section">{t('Company profile')}</h4>
            <div className="form-grid">
              <Field label={t('Company name')}>
                <input value={form.name} onChange={set('name')} placeholder="Acme Holdings (Pty) Ltd" autoFocus />
              </Field>
              <Field label={t('Registration number')}>
                <input value={form.registrationNumber} onChange={set('registrationNumber')} placeholder="BW00001234567" />
              </Field>
              <Field label={t('Domain')}>
                <input value={form.domain} onChange={set('domain')} placeholder="acme.co.bw" />
              </Field>
              <Field label={t('Contact phone')}>
                <input value={form.contactPhone} onChange={set('contactPhone')} placeholder="+267 3 900 000" />
              </Field>
              <Field label={t('Subscription plan')} span2>
                <select value={form.plan} onChange={set('plan')}>
                  {(plans?.plans || []).map((p) => (
                    <option key={p.key} value={p.key}>
                      {t(p.name)} — {fmtMoney(p.price, p.currency)} / {t('month')}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <h4 className="form-section">{t('Company admin')}</h4>
            <p className="mini-note">{t('This person manages the company: hosts, staff, rules and settings. A secure password is generated and shown once.')}</p>
            <div className="form-grid">
              <Field label={t('Full name')}>
                <input value={form.adminName} onChange={set('adminName')} placeholder="Alice Mosweu" />
              </Field>
              <Field label={t('Username')}>
                <input value={form.adminUsername} onChange={set('adminUsername')} placeholder="alice.acme" autoComplete="off" />
              </Field>
              <Field label={t('Email')} span2>
                <input type="email" value={form.adminEmail} onChange={set('adminEmail')} placeholder="alice@acme.co.bw" />
              </Field>
            </div>
          </>
        ) : null}
      </Modal>
      <SecretModal secret={secret} onClose={() => setSecret(null)} />
    </>
  );
}
