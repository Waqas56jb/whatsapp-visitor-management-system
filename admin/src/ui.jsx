// Shared building blocks of both consoles: panels, badges, modals, stat cards, bars, forms.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Ban, Check, Clock, Copy, Inbox, ShieldCheck, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { errorText } from './api/client';
import { useI18n } from './i18n';

export const notify = {
  ok: (msg) => toast.success(msg),
  err: (msg) => toast.error(msg),
};

export const STATUS_LABEL = {
  approved: 'Approved',
  pending: 'Pending',
  rejected: 'Rejected',
  active: 'Active',
  expired: 'Expired',
  used: 'Checked in',
  revoked: 'Revoked',
  blocked: 'Blocked',
  inactive: 'Inactive',
  cancelled: 'Cancelled',
  suspended: 'Suspended',
  terminated: 'Terminated',
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
  new: 'New',
  reviewed: 'Reviewed',
  connected: 'Connected',
  disconnected: 'Not linked',
  connecting: 'Linking',
};

const BADGE_CLASS = {
  suspended: 'pending',
  terminated: 'rejected',
  open: 'pending',
  in_progress: 'approved',
  resolved: 'used',
  closed: 'inactive',
  new: 'pending',
  reviewed: 'approved',
  connected: 'approved',
  disconnected: 'inactive',
  connecting: 'pending',
};

export function Badge({ status, label }) {
  const { t } = useI18n();
  const cls = BADGE_CLASS[status] || (STATUS_LABEL[status] ? status : 'active');
  const Icon =
    ['blocked', 'terminated'].includes(status)
      ? Ban
      : ['approved', 'active', 'used', 'connected', 'resolved'].includes(status)
        ? Check
        : ['pending', 'open', 'new', 'suspended', 'connecting'].includes(status)
          ? Clock
          : ['rejected', 'revoked', 'cancelled'].includes(status)
            ? X
            : ShieldCheck;
  return (
    <span className={`badge ${cls}`}>
      <Icon size={11} strokeWidth={2.6} />
      {label || t(STATUS_LABEL[status] || status)}
    </span>
  );
}

export function Tag({ tone = 'violet', children }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

export function Panel({ icon: Icon, title, sub, actions, children, className = '' }) {
  return (
    <div className={`panel ${className}`}>
      {title ? (
        <div className="panel-head">
          <div className="panel-title">
            {Icon ? (
              <span className="panel-ic">
                <Icon size={16} strokeWidth={2} />
              </span>
            ) : null}
            <div>
              <h3>{title}</h3>
              {sub ? <p>{sub}</p> : null}
            </div>
          </div>
          {actions ? <div className="head-actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function Empty({ icon: Icon = Inbox, children }) {
  return (
    <div className="empty">
      <div className="big">
        <Icon size={24} strokeWidth={1.7} />
      </div>
      {children}
    </div>
  );
}

export function EmptyRow({ cols, icon, children }) {
  return (
    <tr>
      <td colSpan={cols} className="empty">
        <Empty icon={icon}>{children}</Empty>
      </td>
    </tr>
  );
}

export function Stat({ icon: Icon, label, value, tone = 'violet', hint }) {
  const tones = {
    violet: ['#EFE9FF', 'var(--violet-2)'],
    warn: ['var(--warn-bg)', 'var(--warn)'],
    ok: ['var(--ok-bg)', 'var(--ok)'],
    blue: ['#EAF3FF', '#2563EB'],
    bad: ['var(--bad-bg)', 'var(--bad)'],
    teal: ['#E3FBF6', '#0F9E7F'],
  };
  const [bg, fg] = tones[tone] || tones.violet;
  return (
    <div className="stat-card">
      <div className="top">
        <div className="stat-ic" style={{ background: bg, color: fg }}>
          <Icon size={20} strokeWidth={1.9} />
        </div>
      </div>
      <b>{value}</b>
      <span className="lab">{label}</span>
      {hint ? <span className="stat-hint">{hint}</span> : null}
    </div>
  );
}

export function Modal({ open, title, onClose, children, wide = false, footer }) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-bg on" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={'modal' + (wide ? ' modal-wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label={t('Close')}>
            <X size={14} strokeWidth={2.2} />
          </button>
        </div>
        {children}
        {footer ? <div className="form-actions">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Field({ label, children, span2 = false, hint }) {
  return (
    <div className={'f-field' + (span2 ? ' span2' : '')}>
      {label ? <label>{label}</label> : null}
      {children}
      {hint ? <small className="f-hint">{hint}</small> : null}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className={'toggle' + (disabled ? ' disabled' : '')}>
      <input type="checkbox" checked={Boolean(checked)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track">
        <span className="toggle-dot" />
      </span>
      {label ? <span className="toggle-label">{label}</span> : null}
    </label>
  );
}

export function Bars({ items, valueKey = 'value', labelKey = 'label', format = (v) => v, empty }) {
  const max = Math.max(1, ...items.map((i) => Number(i[valueKey]) || 0));
  if (!items.length) return <p className="mini-note pad">{empty}</p>;
  return (
    <div className="dept-bars">
      {items.map((item, idx) => (
        <div className="dept-bar" key={`${item[labelKey]}-${idx}`}>
          <div className="dept-bar-head">
            <span>{item[labelKey]}</span>
            <b>{format(item[valueKey])}</b>
          </div>
          <div className="dept-bar-track">
            <div className="dept-bar-fill" style={{ width: `${((Number(item[valueKey]) || 0) / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Vertical column chart (days, hours).
export function Columns({ items, valueKey = 'value', labelKey = 'label', height = 140 }) {
  const max = Math.max(1, ...items.map((i) => Number(i[valueKey]) || 0));
  return (
    <div className="col-chart" style={{ height: height + 34 }}>
      {items.map((item, idx) => {
        const v = Number(item[valueKey]) || 0;
        return (
          <div className="col-item" key={`${item[labelKey]}-${idx}`} title={`${item[labelKey]}: ${v}`}>
            <span className="col-value">{v || ''}</span>
            <div className="col-bar" style={{ height: `${Math.max(v ? 4 : 1, (v / max) * height)}px` }} />
            <span className="col-label">{item[labelKey]}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Meter({ used, limit, label, unit = '' }) {
  const { t } = useI18n();
  const pct = limit ? Math.min(100, (Number(used) / Number(limit)) * 100) : 0;
  const tone = pct >= 100 ? 'bad' : pct >= 80 ? 'warn' : 'ok';
  return (
    <div className="meter">
      <div className="meter-head">
        <span>{label}</span>
        <b>
          {used}
          {unit} / {limit == null ? t('Unlimited') : `${limit}${unit}`}
        </b>
      </div>
      <div className="meter-track">
        <div className={`meter-fill ${tone}`} style={{ width: `${limit == null ? 4 : pct}%` }} />
      </div>
    </div>
  );
}

export function Stars({ value }) {
  if (value == null) return <span className="muted">—</span>;
  return (
    <span className="stars" aria-label={`${value} / 5`}>
      {'★'.repeat(value)}
      <span className="stars-off">{'★'.repeat(5 - value)}</span>
    </span>
  );
}

// Shows a generated password once, with a copy button.
export function SecretModal({ secret, onClose }) {
  const { t } = useI18n();
  if (!secret) return null;
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret.password);
      notify.ok(t('Copied'));
    } catch {
      notify.err(t('Copy failed — select the password and copy it manually'));
    }
  }
  return (
    <Modal open title={secret.title || t('Sign-in details')} onClose={onClose} footer={<button className="btn btn-violet" onClick={onClose}>{t('Done')}</button>}>
      <div className="modal-body">
        <p className="secret-warning">
          <AlertTriangle size={15} /> {t('This password is shown only once. Copy it now and share it securely.')}
        </p>
        <div className="detail-row">
          <span className="k">{t('Username')}</span>
          <span className="v mono">{secret.username}</span>
        </div>
        <div className="detail-row">
          <span className="k">{t('Password')}</span>
          <span className="v mono secret-value">
            {secret.password}
            <button className="btn-icon" onClick={copy} aria-label={t('Copy')}>
              <Copy size={14} />
            </button>
          </span>
        </div>
        {secret.url ? (
          <div className="detail-row">
            <span className="k">{t('Sign-in page')}</span>
            <span className="v mono">{secret.url}</span>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

// Asks for the exact name before a destructive action.
export function TypedConfirm({ open, title, message, expected, actionLabel, onConfirm, onClose, busy }) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  useEffect(() => setValue(''), [open]);
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button className="btn btn-danger" disabled={value.trim() !== expected || busy} onClick={() => onConfirm(value.trim())}>
            {actionLabel}
          </button>
        </>
      }
    >
      <div className="modal-body">
        <p className="mini-note flush">{message}</p>
        <Field label={t('Type "{name}" to confirm', { name: expected })}>
          <input value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        </Field>
      </div>
    </Modal>
  );
}

export function matches(query, ...fields) {
  if (!query) return true;
  const q = query.toLowerCase();
  return fields.some((f) => String(f ?? '').toLowerCase().includes(q));
}

export function SearchInput({ value, onChange, placeholder }) {
  const { t } = useI18n();
  return (
    <div className="search-box inline">
      <input placeholder={placeholder || t('Search…')} value={value} onChange={(e) => onChange(e.target.value)} aria-label={t('Search')} />
      {value ? (
        <button className="search-clear" type="button" onClick={() => onChange('')} aria-label={t('Clear search')}>
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}

// Loads an API path; reload() refetches. Optional polling interval in ms.
export function useApi(path, { params, interval, initial = null, enabled = true } = {}) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);
  const key = JSON.stringify([path, params]);
  const alive = useRef(true);
  const load = useCallback(
    async ({ quiet = false } = {}) => {
      if (!enabled || !path) return;
      if (!quiet) setLoading(true);
      try {
        const res = await api.get(path, { params });
        if (alive.current) {
          setData(res.data);
          setError(null);
        }
      } catch (err) {
        if (alive.current) setError(errorText(err, 'Could not load data'));
      } finally {
        if (alive.current && !quiet) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, enabled]
  );
  useEffect(() => {
    alive.current = true;
    load();
    if (!interval) return () => (alive.current = false);
    const timer = setInterval(() => load({ quiet: true }), interval);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [load, interval]);
  return { data, loading, error, reload: load, setData };
}

// Runs an action with toasts; returns its result (or undefined on error).
export async function act(fn, success, failure) {
  try {
    const result = await fn();
    if (success) notify.ok(success);
    return result ?? true;
  } catch (err) {
    notify.err(errorText(err, failure));
    return undefined;
  }
}

export function fmtBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

export function fmtNumber(n) {
  return new Intl.NumberFormat('en-GB').format(Number(n) || 0);
}

export function fmtMoney(n, currency = 'BWP') {
  return `${currency} ${new Intl.NumberFormat('en-GB').format(Number(n) || 0)}`;
}

export function fmtDuration(seconds) {
  const s = Number(seconds) || 0;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysAgoIso(days) {
  const d = new Date(Date.now() - days * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function initials(name) {
  return String(name || '')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
