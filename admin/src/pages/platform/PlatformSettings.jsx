import { useEffect, useState } from 'react';
import { DatabaseBackup, Globe, ShieldCheck } from 'lucide-react';
import api from '../../api/client';
import { useI18n } from '../../i18n';
import { act, Field, Panel, Toggle, useApi } from '../../ui';

export default function PlatformSettings() {
  const { t } = useI18n();
  const { data, reload } = useApi('/platform/settings');
  const [s, setS] = useState(null);
  useEffect(() => {
    if (data) setS(data.settings);
  }, [data]);
  if (!s) return <p className="mini-note pad">{t('Loading…')}</p>;
  const num = (k) => (e) => setS({ ...s, [k]: e.target.value });

  async function save() {
    const body = {
      ...s,
      passwordMinLength: Number(s.passwordMinLength),
      sessionHours: Number(s.sessionHours),
      loginAttemptsPer15Min: Number(s.loginAttemptsPer15Min),
      impersonationMinutes: Number(s.impersonationMinutes),
      backupRetentionDays: Number(s.backupRetentionDays),
    };
    if (await act(() => api.put('/platform/settings', body), t('Platform settings saved'), t('Could not save the settings'))) reload();
  }

  return (
    <>
      <Panel icon={Globe} title={t('General')} sub={t('Names and defaults for new companies')}>
        <div className="form-grid">
          <Field label={t('Platform name')} hint={t('Shown on the sign-in page and in the platform console')}>
            <input value={s.platformName} onChange={(e) => setS({ ...s, platformName: e.target.value })} />
          </Field>
          <Field label={t('Support email')}>
            <input type="email" value={s.supportEmail} onChange={(e) => setS({ ...s, supportEmail: e.target.value })} placeholder="support@example.com" />
          </Field>
          <Field label={t('Default chat language')} hint={t('Used for visitors whose language cannot be detected, unless a company sets its own')}>
            <select value={s.defaultLanguage} onChange={(e) => setS({ ...s, defaultLanguage: e.target.value })}>
              <option value="en">English</option>
              <option value="tn">Setswana</option>
            </select>
          </Field>
          <Field label={t('Default plan for new companies')}>
            <select value={s.defaultPlan} onChange={(e) => setS({ ...s, defaultPlan: e.target.value })}>
              <option value="starter">{t('Starter')}</option>
              <option value="business">{t('Business')}</option>
              <option value="enterprise">{t('Enterprise')}</option>
            </select>
          </Field>
        </div>
      </Panel>
      <Panel icon={ShieldCheck} title={t('Security')} sub={t('Applies to every login on the platform')}>
        <div className="form-grid">
          <Field label={t('Minimum password length')}>
            <input type="number" min="8" max="32" value={s.passwordMinLength} onChange={num('passwordMinLength')} />
          </Field>
          <Field label={t('Session length (hours)')} hint={t('Users sign in again after this long')}>
            <input type="number" min="1" max="72" value={s.sessionHours} onChange={num('sessionHours')} />
          </Field>
          <Field label={t('Sign-in attempts per 15 minutes')} hint={t('Per IP address and username')}>
            <input type="number" min="3" max="50" value={s.loginAttemptsPer15Min} onChange={num('loginAttemptsPer15Min')} />
          </Field>
          <Field label={t('“Log in as” session (minutes)')}>
            <input type="number" min="5" max="240" value={s.impersonationMinutes} onChange={num('impersonationMinutes')} />
          </Field>
          <Field span2>
            <Toggle checked={s.maintenanceMode} onChange={(maintenanceMode) => setS({ ...s, maintenanceMode })} label={t('Maintenance mode — company consoles show a maintenance message (the platform console and WhatsApp keep working)')} />
          </Field>
        </div>
      </Panel>
      <Panel icon={DatabaseBackup} title={t('Backups')} sub={data.databaseBackups}>
        <div className="form-grid">
          <Field label={t('Backup retention (days)')} hint={t('Policy recorded for audits; daily database snapshots are taken by the database host')}>
            <input type="number" min="1" max="90" value={s.backupRetentionDays} onChange={num('backupRetentionDays')} />
          </Field>
          <Field label={t('Company data export')}>
            <input value={t('Companies → open a company → Export data')} readOnly disabled />
          </Field>
        </div>
        <div className="form-actions">
          <button className="btn btn-violet" onClick={save}>
            {t('Save settings')}
          </button>
        </div>
      </Panel>
    </>
  );
}
