import { useState } from 'react';
import { Lock, Settings, UserRound } from 'lucide-react';
import api, { setAdminToken } from '../api/client';
import { LanguageSwitch, useI18n } from '../i18n';
import { act, Field, notify, Panel } from '../ui';

export default function Account({ me, refreshMe }) {
  const { t } = useI18n();
  const [name, setName] = useState(me.name || '');
  const [email, setEmail] = useState(me.email || '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const min = me.platform?.passwordMinLength || 10;
  const locked = Boolean(me.impersonating);

  async function saveProfile() {
    const ok = await act(() => api.patch('/auth/profile', { name, email }), t('Profile saved'), t('Could not save your profile'));
    if (ok) refreshMe();
  }

  async function changePassword() {
    if (next.length < min) return notify.err(t('The new password must be at least {min} characters.', { min }));
    if (next !== confirm) return notify.err(t('The new password and its confirmation do not match.'));
    const res = await act(
      () => api.post('/auth/admin/password', { currentPassword: current, newPassword: next, confirmPassword: confirm }),
      t('Password changed. Other sessions were signed out.'),
      t('Could not change the password')
    );
    if (res?.data?.token) {
      setAdminToken(res.data.token);
      setCurrent('');
      setNext('');
      setConfirm('');
    }
  }

  return (
    <>
      <Panel icon={UserRound} title={t('Your profile')} sub={me.company ? t('{role} at {company}', { role: t(me.roleLabel), company: me.company.name }) : t(me.roleLabel)}>
        <div className="form-grid">
          <Field label={t('Name')}>
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={locked} />
          </Field>
          <Field label={t('Email')}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={locked} placeholder="name@company.com" />
          </Field>
          <Field label={t('Username')}>
            <input value={me.username} disabled readOnly />
          </Field>
          <Field label={t('Role')}>
            <input value={t(me.roleLabel)} disabled readOnly />
          </Field>
        </div>
        <div className="form-actions">
          <button className="btn btn-violet" onClick={saveProfile} disabled={locked}>
            {t('Save profile')}
          </button>
        </div>
      </Panel>

      <Panel icon={Lock} title={t('Change password')} sub={t('At least {min} characters. Your other signed-in sessions will be signed out.', { min })}>
        {locked ? <p className="mini-note pad">{t('Passwords cannot be changed while you are signed in as a company.')}</p> : null}
        <div className="form-grid">
          <Field label={t('Current password')} span2>
            <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} disabled={locked} />
          </Field>
          <Field label={t('New password')}>
            <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} disabled={locked} />
          </Field>
          <Field label={t('Confirm new password')}>
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={locked} />
          </Field>
        </div>
        <div className="form-actions">
          <button className="btn btn-violet" onClick={changePassword} disabled={locked || !current || !next}>
            {t('Change password')}
          </button>
        </div>
      </Panel>

      <Panel icon={Settings} title={t('Preferences')} sub={t('Language of this console')}>
        <div className="pref-rows">
          <div className="pref-row">
            <div>
              <b>{t('Language')}</b>
              <p>{t('English is the default. Setswana is available for the whole console.')}</p>
            </div>
            <LanguageSwitch className="lang-switch-lg" />
          </div>
        </div>
      </Panel>
    </>
  );
}
