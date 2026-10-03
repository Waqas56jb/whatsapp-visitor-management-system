import { useEffect, useState } from 'react';
import { Building2, Clock, Gauge, Headset, Lock, MessageSquareText, Palette, Plug, ShieldCheck, Hash, Wifi } from 'lucide-react';
import api from '../../api/client';
import CompanyWhatsApp from '../../components/CompanyWhatsApp';
import { useI18n } from '../../i18n';
import { act, Field, Meter, notify, Panel, Toggle, fmtMoney, useApi } from '../../ui';

const DAYS = [
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday'],
];
const TABS = [
  ['profile', 'Profile & hours', Building2],
  ['rules', 'Visitation rules', ShieldCheck],
  ['branding', 'Branding', Palette],
  ['templates', 'Message templates', MessageSquareText],
  ['integrations', 'Integrations', Plug],
  ['plan', 'Plan & usage', Gauge],
];

const FEATURE_LABELS = {
  knowledge_base: 'Knowledge base (files, website, Q&A)',
  ai_answers: 'AI answers to visitor questions',
  appointments: 'Appointments (book, reschedule, calendar invites)',
  feedback: 'Visitor feedback and complaints',
  service_requests: 'Service requests and tickets',
  human_handover: 'Hand over to a human agent',
  visitation_rules: 'Visitation rules (ID upload, NDA, health screening)',
  reminders: 'Visit reminders 1 hour before',
  white_label: 'White-labelling (logo, colours, message templates)',
  slack: 'Slack notifications',
  guest_wifi: 'Guest Wi-Fi details in passes',
  reports_pdf: 'PDF reports',
};

function Locked({ feature }) {
  const { t } = useI18n();
  return (
    <p className="locked-note">
      <Lock size={14} /> {t('{feature} is not included in your plan. Ask the platform administrator to upgrade.', { feature: t(feature) })}
    </p>
  );
}

export default function CompanySettings({ me, refreshMe }) {
  const { t } = useI18n();
  const { data, reload } = useApi('/settings');
  const { data: usage } = useApi('/plan');
  const [tab, setTab] = useState('profile');
  const [s, setS] = useState(null);
  const [b, setB] = useState(null);
  const canEdit = me.permissions.includes('settings.manage');
  const canWa = me.permissions.includes('whatsapp.manage');

  useEffect(() => {
    if (data) {
      setS(structuredClone(data.settings));
      setB(structuredClone(data.branding));
    }
  }, [data]);
  if (!s || !b) return <p className="mini-note pad">{t('Loading…')}</p>;
  const f = data.features;

  async function save(patch, message = t('Settings saved')) {
    if (await act(() => api.put('/settings', patch), message, t('Could not save the settings'))) reload();
  }

  async function saveBranding() {
    if (await act(() => api.put('/settings/branding', b), t('Branding saved'), t('Could not save the branding'))) {
      reload();
      refreshMe();
    }
  }

  function pickLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 300 * 1024) return notify.err(t('The logo must be smaller than 300 KB'));
    const reader = new FileReader();
    reader.onload = () => setB({ ...b, logo: String(reader.result) });
    reader.readAsDataURL(file);
  }

  const setRule = (k, v) => setS({ ...s, rules: { ...s.rules, [k]: v } });
  const setHours = (day, k, v) => setS({ ...s, hours: { ...s.hours, [day]: { ...s.hours[day], [k]: v } } });
  const setTpl = (key, lang, v) => setS({ ...s, templates: { ...s.templates, [key]: { ...s.templates[key], [lang]: v } } });
  const setInt = (k, v) => setS({ ...s, integrations: { ...s.integrations, [k]: v } });

  return (
    <>
      <div className="kb-tabs settings-tabs" role="tablist">
        {TABS.map(([key, label, Icon]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={'kb-tab' + (tab === key ? ' active' : '')} onClick={() => setTab(key)}>
            <Icon size={15} /> {t(label)}
          </button>
        ))}
      </div>

      {tab === 'profile' ? (
        <>
          <Panel icon={Building2} title={t('Company profile')} sub={t('Name and registration are managed by the platform administrator')}>
            <div className="form-grid">
              <Field label={t('Company name')}>
                <input value={data.profile.name} disabled readOnly />
              </Field>
              <Field label={t('Registration number')}>
                <input value={data.profile.registrationNumber || '—'} disabled readOnly />
              </Field>
              <Field label={t('Phone')}>
                <input value={s.phone} onChange={(e) => setS({ ...s, phone: e.target.value })} disabled={!canEdit} placeholder="+267 3 900 000" />
              </Field>
              <Field label={t('Email')}>
                <input value={s.email} onChange={(e) => setS({ ...s, email: e.target.value })} disabled={!canEdit} placeholder="reception@company.co.bw" />
              </Field>
              <Field label={t('Street address')} hint={t('Shown to visitors on their pass and when they ask where you are')}>
                <input value={s.address} onChange={(e) => setS({ ...s, address: e.target.value })} disabled={!canEdit} placeholder="Plot 54368, CBD" />
              </Field>
              <Field label={t('City / area')}>
                <input value={s.location} onChange={(e) => setS({ ...s, location: e.target.value })} disabled={!canEdit} placeholder="Gaborone" />
              </Field>
              <Field label={t('Time zone')}>
                <select value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })} disabled={!canEdit}>
                  {['Africa/Gaborone', 'Africa/Johannesburg', 'Africa/Harare', 'Africa/Windhoek', 'Africa/Lusaka', 'Africa/Nairobi', 'Africa/Lagos', 'Europe/London', 'Asia/Dubai'].map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('Chat language for new visitors')}>
                <select value={s.defaultLanguage} onChange={(e) => setS({ ...s, defaultLanguage: e.target.value })} disabled={!canEdit}>
                  <option value="en">English</option>
                  <option value="tn">Setswana</option>
                </select>
              </Field>
            </div>
          </Panel>
          <Panel icon={Clock} title={t('Office hours')} sub={t('Visitors can only book times inside these hours; the assistant also answers “What are your opening hours?” from here')}>
            <div className="hours-grid">
              {DAYS.map(([key, label]) => (
                <div className="hours-row" key={key}>
                  <b>{t(label)}</b>
                  <Toggle checked={!s.hours[key].closed} onChange={(open) => setHours(key, 'closed', !open)} label={s.hours[key].closed ? t('Closed') : t('Open')} disabled={!canEdit} />
                  <input type="time" value={s.hours[key].open} onChange={(e) => setHours(key, 'open', e.target.value)} disabled={!canEdit || s.hours[key].closed} />
                  <span>–</span>
                  <input type="time" value={s.hours[key].close} onChange={(e) => setHours(key, 'close', e.target.value)} disabled={!canEdit || s.hours[key].closed} />
                </div>
              ))}
            </div>
            {canEdit ? (
              <div className="form-actions">
                <button className="btn btn-violet" onClick={() => save({ phone: s.phone, email: s.email, address: s.address, location: s.location, timezone: s.timezone, defaultLanguage: s.defaultLanguage, hours: s.hours })}>
                  {t('Save profile and hours')}
                </button>
              </div>
            ) : null}
          </Panel>
          <Panel icon={Headset} title={t('Human handover teams')} sub={t('The teams a visitor can ask for when they type HUMAN or AGENT (one per line)')}>
            {!f.human_handover ? <Locked feature="Hand over to a human agent" /> : null}
            <div className="form-grid">
              <Field span2>
                <textarea
                  rows={5}
                  value={s.departments.handover.join('\n')}
                  onChange={(e) => setS({ ...s, departments: { handover: e.target.value.split('\n') } })}
                  disabled={!canEdit || !f.human_handover}
                />
              </Field>
            </div>
            {canEdit && f.human_handover ? (
              <div className="form-actions">
                <button className="btn btn-violet" onClick={() => save({ departments: { handover: s.departments.handover.map((d) => d.trim()).filter(Boolean) } })}>
                  {t('Save teams')}
                </button>
              </div>
            ) : null}
          </Panel>
        </>
      ) : null}

      {tab === 'rules' ? (
        <Panel icon={ShieldCheck} title={t('Visitation rules')} sub={t('Checks visitors complete on WhatsApp before their request reaches the host')}>
          {!f.visitation_rules ? <Locked feature="Visitation rules (ID upload, NDA, health screening)" /> : null}
          <div className="form-grid">
            <Field label={t('ID document upload')} span2 hint={t('Visitors send a photo or PDF of their ID; staff can open it from the visit')}>
              <select value={s.rules.requireId} onChange={(e) => setRule('requireId', e.target.value)} disabled={!canEdit || !f.visitation_rules}>
                <option value="never">{t('Not required')}</option>
                <option value="first_visit">{t('Required on the first visit')}</option>
                <option value="every_visit">{t('Required on every visit')}</option>
              </select>
            </Field>
            <Field span2>
              <Toggle checked={s.rules.requireNda} onChange={(v) => setRule('requireNda', v)} label={t('Visitors must accept a non-disclosure agreement (reply I AGREE)')} disabled={!canEdit || !f.visitation_rules} />
            </Field>
            {s.rules.requireNda ? (
              <Field label={t('Agreement text')} span2>
                <textarea rows={4} value={s.rules.ndaText} onChange={(e) => setRule('ndaText', e.target.value)} disabled={!canEdit || !f.visitation_rules} />
              </Field>
            ) : null}
            <Field span2>
              <Toggle checked={s.rules.healthScreening} onChange={(v) => setRule('healthScreening', v)} label={t('Health screening — a “Yes” answer flags the visit for reception')} disabled={!canEdit || !f.visitation_rules} />
            </Field>
            {s.rules.healthScreening ? (
              <Field label={t('Screening questions (one per line, yes/no)')} span2>
                <textarea rows={4} value={s.rules.healthQuestions.join('\n')} onChange={(e) => setRule('healthQuestions', e.target.value.split('\n'))} disabled={!canEdit || !f.visitation_rules} />
              </Field>
            ) : null}
          </div>
          {canEdit && f.visitation_rules ? (
            <div className="form-actions">
              <button className="btn btn-violet" onClick={() => save({ rules: { ...s.rules, healthQuestions: s.rules.healthQuestions.map((q) => q.trim()).filter(Boolean) } }, t('Visitation rules saved'))}>
                {t('Save rules')}
              </button>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {tab === 'branding' ? (
        <Panel icon={Palette} title={t('White-labelling')} sub={t('Your logo and colours in this console and on the visitor’s pass page')}>
          {!f.white_label ? <Locked feature="White-labelling (logo, colours, message templates)" /> : null}
          <div className="form-grid">
            <Field label={t('Display name')}>
              <input value={b.displayName} onChange={(e) => setB({ ...b, displayName: e.target.value })} disabled={!canEdit || !f.white_label} />
            </Field>
            <Field label={t('Logo (PNG, JPEG, SVG — max 300 KB)')}>
              <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={pickLogo} disabled={!canEdit || !f.white_label} />
            </Field>
            <Field label={t('Primary colour')}>
              <div className="color-row">
                <input type="color" value={b.primaryColor} onChange={(e) => setB({ ...b, primaryColor: e.target.value })} disabled={!canEdit || !f.white_label} />
                <code>{b.primaryColor}</code>
              </div>
            </Field>
            <Field label={t('Accent colour')}>
              <div className="color-row">
                <input type="color" value={b.accentColor} onChange={(e) => setB({ ...b, accentColor: e.target.value })} disabled={!canEdit || !f.white_label} />
                <code>{b.accentColor}</code>
              </div>
            </Field>
          </div>
          <div className="brand-preview" style={{ '--bp': b.primaryColor, '--ba': b.accentColor }}>
            {b.logo ? <img src={b.logo} alt="" /> : <div className="brand-preview-mark" />}
            <b>{b.displayName || data.profile.name}</b>
            <span className="brand-preview-btn">{t('Preview button')}</span>
            {b.logo && canEdit && f.white_label ? (
              <button className="btn btn-sm btn-ghost" onClick={() => setB({ ...b, logo: '' })}>
                {t('Remove logo')}
              </button>
            ) : null}
          </div>
          {canEdit && f.white_label ? (
            <div className="form-actions">
              <button className="btn btn-violet" onClick={saveBranding}>
                {t('Save branding')}
              </button>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {tab === 'templates' ? (
        <Panel icon={MessageSquareText} title={t('WhatsApp message templates')} sub={t('Replace the standard wording. Leave empty to use the default. You can use {company}; the approval message can also use {ref}, {host}, {date}, {time}, {location}, {pin}.')}>
          {!f.white_label ? <Locked feature="White-labelling (logo, colours, message templates)" /> : null}
          {[
            ['welcome', 'Welcome message for new visitors'],
            ['approved', 'Visit approved (sent with the QR pass)'],
            ['goodbye', 'End of conversation'],
          ].map(([key, label]) => (
            <div className="form-grid" key={key}>
              <Field label={`${t(label)} — English`}>
                <textarea rows={3} value={s.templates[key].en} onChange={(e) => setTpl(key, 'en', e.target.value)} disabled={!canEdit || !f.white_label} />
              </Field>
              <Field label={`${t(label)} — Setswana`}>
                <textarea rows={3} value={s.templates[key].tn} onChange={(e) => setTpl(key, 'tn', e.target.value)} disabled={!canEdit || !f.white_label} />
              </Field>
            </div>
          ))}
          {canEdit && f.white_label ? (
            <div className="form-actions">
              <button className="btn btn-violet" onClick={() => save({ templates: s.templates }, t('Templates saved'))}>
                {t('Save templates')}
              </button>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {tab === 'integrations' ? (
        <>
          {canWa ? <CompanyWhatsApp onToast={(msg, isErr) => (isErr ? notify.err(msg) : notify.ok(msg))} /> : null}
          <Panel icon={Hash} title={t('Slack')} sub={t('Post new requests, check-ins, complaints, service requests and handovers to a Slack channel')}>
            {!f.slack ? <Locked feature="Slack notifications" /> : null}
            <div className="form-grid">
              <Field label={t('Incoming webhook URL')} span2 hint={t('In Slack: Apps → Incoming Webhooks → Add to a channel, then paste the URL here')}>
                <input value={s.integrations.slackWebhook} onChange={(e) => setInt('slackWebhook', e.target.value)} placeholder="https://hooks.slack.com/services/…" disabled={!canEdit || !f.slack} />
              </Field>
              {[
                ['newVisit', 'New visit and appointment requests'],
                ['checkIn', 'Visitor check-ins'],
                ['complaint', 'Complaints'],
                ['serviceRequest', 'Service requests'],
                ['handover', 'Visitors asking for a person'],
              ].map(([key, label]) => (
                <Field key={key}>
                  <Toggle checked={s.integrations.slackEvents[key]} onChange={(v) => setInt('slackEvents', { ...s.integrations.slackEvents, [key]: v })} label={t(label)} disabled={!canEdit || !f.slack} />
                </Field>
              ))}
            </div>
            {canEdit && f.slack ? (
              <div className="form-actions">
                <button className="btn btn-ghost" onClick={() => act(() => api.post('/settings/slack/test', { webhook: s.integrations.slackWebhook }), t('Test message sent to Slack'), t('Slack test failed'))}>
                  {t('Send test message')}
                </button>
                <button className="btn btn-violet" onClick={() => save({ integrations: { slackWebhook: s.integrations.slackWebhook, slackEvents: s.integrations.slackEvents } }, t('Slack settings saved'))}>
                  {t('Save Slack settings')}
                </button>
              </div>
            ) : null}
          </Panel>
          <Panel icon={Wifi} title={t('Guest Wi-Fi')} sub={t('Sent to visitors on WhatsApp when they check in at the gate')}>
            {!f.guest_wifi ? <Locked feature="Guest Wi-Fi details in passes" /> : null}
            <div className="form-grid">
              <Field span2>
                <Toggle checked={s.integrations.wifi.enabled} onChange={(v) => setInt('wifi', { ...s.integrations.wifi, enabled: v })} label={t('Send guest Wi-Fi details at check-in')} disabled={!canEdit || !f.guest_wifi} />
              </Field>
              <Field label={t('Network name (SSID)')}>
                <input value={s.integrations.wifi.ssid} onChange={(e) => setInt('wifi', { ...s.integrations.wifi, ssid: e.target.value })} disabled={!canEdit || !f.guest_wifi} />
              </Field>
              <Field label={t('Password')}>
                <input value={s.integrations.wifi.password} onChange={(e) => setInt('wifi', { ...s.integrations.wifi, password: e.target.value })} disabled={!canEdit || !f.guest_wifi} />
              </Field>
            </div>
            {canEdit && f.guest_wifi ? (
              <div className="form-actions">
                <button className="btn btn-violet" onClick={() => save({ integrations: { wifi: s.integrations.wifi } }, t('Wi-Fi settings saved'))}>
                  {t('Save Wi-Fi settings')}
                </button>
              </div>
            ) : null}
          </Panel>
        </>
      ) : null}

      {tab === 'plan' && usage ? (
        <Panel icon={Gauge} title={t('{plan} plan', { plan: t(usage.plan.name) })} sub={`${fmtMoney(usage.plan.price, usage.plan.currency)} / ${t('month')} · ${t('Managed by the platform administrator')}`}>
          <div className="meters">
            {Object.entries(usage.usage).map(([key, u]) => (
              <Meter key={key} label={t(u.label)} used={u.used} limit={u.limit} unit={key === 'storage_mb' ? ' MB' : ''} />
            ))}
          </div>
          <div className="feature-grid">
            {Object.entries(usage.features).map(([key, on]) => (
              <div className="feature-row" key={key}>
                <b>{t(FEATURE_LABELS[key] || key)}</b>
                <span className={on ? 'ok-text' : 'muted'}>{on ? t('Included') : t('Not included')}</span>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </>
  );
}
