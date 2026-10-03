import { useState } from 'react';
import { Check, ClipboardList, MoreHorizontal, Plus, X } from 'lucide-react';
import api, { errorText } from '../../api/client';
import { useI18n } from '../../i18n';
import { Badge, EmptyRow, Field, Modal, notify, Panel, SearchInput, matches, useApi } from '../../ui';
import { FlagTag, KindTag, loadVisit, useVisitActions, VisitModal } from './shared';

const EMPTY = { kind: 'visit', name: '', company: '', phone: '', hostId: '', purpose: '', topic: '', appointmentType: 'consultation', date: '', time: '' };

export default function Visits({ me }) {
  const { t, formatDate } = useI18n();
  const { data, reload } = useApi('/visits', { initial: [], interval: 30000 });
  const { data: hosts } = useApi('/hosts', { initial: [], enabled: me.permissions.includes('hosts.view') });
  const { decide } = useVisitActions(reload);
  const [status, setStatus] = useState('all');
  const [kind, setKind] = useState('all');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState(null);
  const perms = new Set(me.permissions);
  const appointmentsOn = me.company.features.appointments;

  const rows = (data || [])
    .filter((v) => status === 'all' || v.status === status)
    .filter((v) => kind === 'all' || v.kind === kind)
    .filter((v) => !flaggedOnly || v.flagged)
    .filter((v) => matches(query, v.ref, v.visitor, v.company, v.host, v.purpose, v.topic));

  async function create() {
    if (!form.name.trim() || !form.hostId || !form.date) return notify.err(t('Please fill in the visitor name, host and date'));
    try {
      const purpose = form.kind === 'appointment' ? `${form.appointmentType.replace('_', ' ')}: ${form.topic}` : form.purpose;
      await api.post('/visits', { ...form, host_id: form.hostId, purpose });
      setForm(null);
      reload();
      notify.ok(t('Request created and sent to the host'));
    } catch (err) {
      notify.err(errorText(err, t('Could not create the request')));
    }
  }

  return (
    <>
      <Panel
        icon={ClipboardList}
        title={t('Visits & appointments')}
        sub={t('{count} shown', { count: rows.length })}
        actions={
          <>
            <SearchInput value={query} onChange={setQuery} />
            <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('Filter by status')}>
              <option value="all">{t('All statuses')}</option>
              <option value="pending">{t('Pending')}</option>
              <option value="approved">{t('Approved')}</option>
              <option value="used">{t('Checked in')}</option>
              <option value="rejected">{t('Rejected')}</option>
              <option value="cancelled">{t('Cancelled')}</option>
            </select>
            {appointmentsOn ? (
              <select className="filter-select" value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t('Filter by type')}>
                <option value="all">{t('Visits and appointments')}</option>
                <option value="visit">{t('Visits')}</option>
                <option value="appointment">{t('Appointments')}</option>
              </select>
            ) : null}
            <label className="check-inline">
              <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} /> {t('Flagged only')}
            </label>
            {perms.has('visits.create') ? (
              <button className="btn btn-violet btn-sm" onClick={() => setForm({ ...EMPTY, hostId: hosts?.[0]?.id || '' })}>
                <Plus size={14} strokeWidth={2.4} /> {t('New request')}
              </button>
            ) : null}
          </>
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('Reference')}</th>
                <th>{t('Visitor')}</th>
                <th>{t('Host')}</th>
                <th>{t('Purpose')}</th>
                <th>{t('Date / Time')}</th>
                <th>{t('Status')}</th>
                <th>{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((v) => (
                  <tr key={v.id}>
                    <td className="cell-main nowrap" data-label={t('Reference')}>
                      {v.ref}
                      <div>
                        <KindTag v={v} /> <FlagTag v={v} />
                      </div>
                    </td>
                    <td data-label={t('Visitor')}>
                      <div className="cell-main">{v.visitor}</div>
                      {v.company && v.company !== '—' ? <div className="cell-sub">{v.company}</div> : null}
                    </td>
                    <td data-label={t('Host')}>{v.host}</td>
                    <td data-label={t('Purpose')}>{v.purpose}</td>
                    <td data-label={t('Date / Time')} className="nowrap">
                      {formatDate(v.date)} · {v.time}
                    </td>
                    <td data-label={t('Status')}>
                      <Badge status={v.status} />
                    </td>
                    <td data-label={t('Actions')}>
                      <div className="row-actions">
                        {v.status === 'pending' && perms.has('visits.decide') ? (
                          <>
                            <button className="btn btn-sm btn-teal" onClick={() => decide(v.id, 'approved')}>
                              <Check size={13} strokeWidth={2.5} /> {t('Approve')}
                            </button>
                            <button className="btn btn-sm btn-danger" onClick={() => decide(v.id, 'rejected')}>
                              <X size={13} strokeWidth={2.5} /> {t('Decline')}
                            </button>
                          </>
                        ) : null}
                        <button className="btn-icon" onClick={async () => setOpen(await loadVisit(v.id))} aria-label={t('View details')}>
                          <MoreHorizontal size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <EmptyRow cols={7} icon={ClipboardList}>
                  {t('No requests match this filter')}
                </EmptyRow>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <VisitModal
        visit={open}
        onClose={() => setOpen(null)}
        onChanged={async () => {
          reload();
          setOpen(await loadVisit(open.id));
        }}
        canDecide={perms.has('visits.decide')}
        canFlag={perms.has('visits.flag')}
      />

      <Modal
        open={Boolean(form)}
        title={t('New request')}
        onClose={() => setForm(null)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setForm(null)}>
              {t('Cancel')}
            </button>
            <button className="btn btn-violet" onClick={create}>
              {t('Create and notify host')}
            </button>
          </>
        }
      >
        {form ? (
          <div className="form-grid full">
            {appointmentsOn ? (
              <Field label={t('Type')}>
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  <option value="visit">{t('Visit')}</option>
                  <option value="appointment">{t('Appointment')}</option>
                </select>
              </Field>
            ) : null}
            <Field label={t('Visitor name')}>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label={t('Visitor company')}>
              <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </Field>
            <Field label={t('Visitor WhatsApp (to receive the pass)')}>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+267 71 000 000" />
            </Field>
            <Field label={t('Host')}>
              <select value={form.hostId} onChange={(e) => setForm({ ...form, hostId: e.target.value })}>
                {(hosts || [])
                  .filter((h) => h.status === 'active')
                  .map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                      {h.department ? ` — ${h.department}` : ''}
                    </option>
                  ))}
              </select>
            </Field>
            {form.kind === 'appointment' ? (
              <>
                <Field label={t('Appointment type')}>
                  <select value={form.appointmentType} onChange={(e) => setForm({ ...form, appointmentType: e.target.value })}>
                    <option value="consultation">{t('Consultation')}</option>
                    <option value="business_meeting">{t('Business Meeting')}</option>
                    <option value="service_support">{t('Service / Support')}</option>
                    <option value="sales">{t('Sales')}</option>
                    <option value="other">{t('Other')}</option>
                  </select>
                </Field>
                <Field label={t('What will be discussed')}>
                  <input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
                </Field>
              </>
            ) : (
              <Field label={t('Purpose')}>
                <input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder={t('Meeting, Interview, Delivery…')} />
              </Field>
            )}
            <Field label={t('Date')}>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label={t('Time')}>
              <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </Field>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
