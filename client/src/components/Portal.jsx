import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Bell,
  BookOpen,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  QrCode,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import Agent from './Agent';
import Conversations from './Conversations';
import HostDirectory from './HostDirectory';
import KnowledgeBase from './KnowledgeBase';
import ScreenLoader from './ScreenLoader';
import WhatsAppLink from './WhatsAppLink';
import { initials } from '../lib/db';
import api, { setClientToken } from '../api/client';
import { LanguageSwitch, useI18n } from '../i18n';

const VIEWS = [
  { id: 'overview', icon: LayoutDashboard, label: 'Overview', sub: 'Today at a glance' },
  { id: 'requests', icon: ClipboardList, label: 'Visit requests', sub: 'Approve or reject every company visit request' },
  { id: 'conversations', icon: MessagesSquare, label: 'Conversations', sub: 'WhatsApp threads with visitors' },
  { id: 'agent', icon: Bot, label: 'AI Agent', sub: 'Ask about visitors, or approve and reject requests' },
  { id: 'whatsapp', icon: QrCode, label: 'WhatsApp', sub: 'One company WhatsApp number for all visitors' },
  { id: 'hosts', icon: UserCheck, label: 'Hosts', sub: 'People and departments visitors can book' },
  { id: 'knowledge', icon: BookOpen, label: 'Knowledge base', sub: 'Company facts the WhatsApp assistant can answer from' },
  { id: 'passes', icon: QrCode, label: 'Passes', sub: 'Active QR passes for approved visitors' },
  { id: 'history', icon: History, label: 'History', sub: 'Every visit on record' },
  { id: 'notifications', icon: Bell, label: 'Notifications', sub: 'Recent activity' },
  { id: 'profile', icon: Settings, label: 'Profile', sub: 'Your account details' },
];

const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', used: 'Checked in', blocked: 'Blocked', cancelled: 'Cancelled' };

function Badge({ status }) {
  const { t } = useI18n();
  const Icon = status === 'approved' || status === 'used' ? Check : status === 'pending' ? Clock : X;
  return (
    <span className={`ap-badge ${status}`}>
      <Icon size={11} strokeWidth={2.6} />
      {t(STATUS_LABEL[status] || status)}
    </span>
  );
}

function playNotifySound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    const beep = (start, freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    };
    beep(now, 880);
    beep(now + 0.16, 1175);
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    /* ignore autoplay limits */
  }
}

function EmptyState({ icon: Icon, children }) {
  return (
    <>
      <div className="big">
        <Icon size={24} strokeWidth={1.7} />
      </div>
      {children}
    </>
  );
}

function useFormatters() {
  const { formatDate } = useI18n();
  return { date: (value) => formatDate(value ? String(value).slice(0, 10) : value) };
}

function VisitMeta({ v }) {
  const { t } = useI18n();
  const fmt = useFormatters();
  return (
    <span>
      {v.company ? `${v.company} · ` : ''}
      {t('Host')}: {v.host}
      {v.hostDepartment && v.hostDepartment !== '—' ? ` (${v.hostDepartment})` : ''}
      <br />
      {v.purpose} · {fmt.date(v.date)} · {v.time} · {v.ref}
    </span>
  );
}

function ReqCard({ v, onDecide, busy }) {
  const { t } = useI18n();
  return (
    <div className="ap-req-card">
      <div className="ap-row-flex">
        <div className="ap-avatar-sm">{initials(v.visitor)}</div>
        <div className="ap-req-info">
          <b>{v.visitor}</b>
          <VisitMeta v={v} />
        </div>
      </div>
      <div className="ap-req-actions">
        <button className="ap-btn ap-btn-sm ap-btn-teal" disabled={busy} onClick={() => onDecide(v.id, 'approved')}>
          <Check size={13} strokeWidth={2.5} /> {t('Approve')}
        </button>
        <button className="ap-btn ap-btn-sm ap-btn-danger" disabled={busy} onClick={() => onDecide(v.id, 'rejected')}>
          <X size={13} strokeWidth={2.5} /> {t('Reject')}
        </button>
      </div>
    </div>
  );
}

export default function Portal({ on, currentUser, initialView = 'overview', onBackToSite, onToast }) {
  const { t, formatDate } = useI18n();
  const fmt = useFormatters();
  const [view, setView] = useState(initialView);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [visits, setVisits] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [profile, setProfile] = useState(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const seenPending = useRef(new Set());
  const primed = useRef(false);
  const tRef = useRef(t);
  tRef.current = t;

  const pending = visits.filter((v) => v.status === 'pending');
  const approved = visits.filter((v) => v.status === 'approved');
  const active = VIEWS.find((v) => v.id === view) || VIEWS[0];

  async function fetchHostData({ silent = false } = {}) {
    if (!on || !currentUser) return;
    if (!silent) setPageLoading(true);
    try {
      const [v, n, p] = await Promise.all([api.get('/host/visits'), api.get('/host/notifications'), api.get('/host/profile')]);
      const nextVisits = v.data || [];
      const nextPending = nextVisits.filter((item) => item.status === 'pending');
      if (primed.current) {
        const fresh = nextPending.filter((item) => !seenPending.current.has(item.id));
        if (fresh.length) {
          playNotifySound();
          onToast(
            fresh.length === 1
              ? tRef.current('New visit request from {name}', { name: fresh[0].visitor })
              : tRef.current('{count} new visit requests waiting for approval', { count: fresh.length })
          );
        }
      }
      seenPending.current = new Set(nextPending.map((item) => item.id));
      primed.current = true;
      setVisits(nextVisits);
      setNotifications(n.data || []);
      setProfile(p.data || null);
    } catch {
      if (!silent) onToast(tRef.current('Could not load portal data'), true);
    } finally {
      if (!silent) setPageLoading(false);
    }
  }

  useEffect(() => {
    fetchHostData();
  }, [on, currentUser]);

  useEffect(() => {
    if (!on || !currentUser) return undefined;
    const timer = setInterval(() => fetchHostData({ silent: true }), 12000);
    return () => clearInterval(timer);
  }, [on, currentUser]);

  useEffect(() => {
    document.body.classList.toggle('drawer-open', sidebarOpen);
    return () => document.body.classList.remove('drawer-open');
  }, [sidebarOpen]);

  function switchView(name) {
    setView(name);
    setSidebarOpen(false);
  }

  async function decide(id, decision) {
    setDeciding(true);
    try {
      await api.patch(`/host/visits/${id}/${decision === 'approved' ? 'approve' : 'reject'}`);
      const v = visits.find((x) => x.id === id);
      await fetchHostData({ silent: true });
      const name = v?.visitor || t('Visitor');
      onToast(
        decision === 'approved'
          ? t('{name} approved — the QR pass was sent on WhatsApp', { name })
          : t('{name} rejected — the visitor has been told on WhatsApp', { name })
      );
    } catch {
      onToast(t('Could not update this visit'), true);
    } finally {
      setDeciding(false);
    }
  }

  function doLogout() {
    setClientToken(null);
    sessionStorage.removeItem('botho_client_user');
    location.reload();
  }

  return (
    <div id="app" className={on ? 'on' : ''}>
      <ScreenLoader show={on && pageLoading} label={t('Loading portal…')} />
      <div className={'ap-sidebar-backdrop' + (sidebarOpen ? ' open' : '')} onClick={() => setSidebarOpen(false)} />
      <div className="ap-shell">
        <aside className={'ap-sidebar' + (sidebarOpen ? ' open' : '')} id="apSidebar">
          <div className="ap-brand">
            <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <defs>
                <linearGradient id="apBrandGrad" x1="0" y1="0" x2="40" y2="40">
                  <stop offset="0%" stopColor="#22E8C8" />
                  <stop offset="100%" stopColor="#8B6BFF" />
                </linearGradient>
              </defs>
              <rect width="40" height="40" rx="11" fill="url(#apBrandGrad)" />
              <path d="M12 20a8 8 0 1 1 3.2 6.4L11 28l1.4-4.2A8 8 0 0 1 12 20Z" stroke="#0D0822" strokeWidth="2" fill="none" />
              <path d="M17 19.5l2 2 4-4.2" stroke="#0D0822" strokeWidth="2" fill="none" />
            </svg>
            {t('Client Portal')}
          </div>
          <nav className="ap-nav">
            {VIEWS.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} className={'ap-link' + (view === item.id ? ' active' : '')} onClick={() => switchView(item.id)}>
                  <span className="ic">
                    <Icon size={18} strokeWidth={1.85} />
                  </span>
                  {t(item.label)}
                  {item.id === 'requests' && pending.length ? <span className="ap-sbadge">{pending.length}</span> : null}
                </button>
              );
            })}
          </nav>
          <div className="ap-foot">
            <div className="ap-user">
              <div className="ap-avatar">{currentUser ? initials(currentUser.name) : '--'}</div>
              <div>
                <b>{currentUser ? currentUser.name : '—'}</b>
                <span>{currentUser ? t(currentUser.role) : '—'}</span>
              </div>
            </div>
            <button className="ap-logout" onClick={doLogout}>
              <LogOut size={15} strokeWidth={2} />
              {t('Sign out')}
            </button>
          </div>
        </aside>

        <main className="ap-main">
          <div className="ap-topbar">
            <div className="ap-topbar-lead">
              <button className="ap-menu-toggle" onClick={() => setSidebarOpen((o) => !o)} aria-label={t('Open menu')}>
                <Menu size={20} strokeWidth={2} />
              </button>
              <div>
                <h2>{t(active.label)}</h2>
                <p className="sub">{t(active.sub)}</p>
              </div>
            </div>
            <div className="ap-topbar-actions">
              <LanguageSwitch />
              <button
                className="ap-bell"
                type="button"
                onClick={() => switchView('requests')}
                aria-label={pending.length ? t('{count} requests waiting for approval', { count: pending.length }) : t('Notifications')}
              >
                <Bell size={18} strokeWidth={2.1} />
                {pending.length ? <span className="ap-bell-dot">{pending.length}</span> : null}
              </button>
              <button className="ap-btn ap-btn-ghost ap-btn-sm ap-back-site" onClick={onBackToSite}>
                <ArrowLeft size={14} strokeWidth={2.2} /> <span>{t('Back to site')}</span>
              </button>
            </div>
          </div>

          <div className="ap-content">
            <section className={'ap-view' + (view === 'overview' ? ' active' : '')}>
              <div className="dash-hero">
                <div>
                  <h3>
                    {currentUser?.name
                      ? t('Welcome back, {name}', { name: currentUser.name.split(' ')[0] })
                      : t('Welcome back')}
                  </h3>
                  <p>{t('Review visit requests, issue passes, and keep reception moving.')}</p>
                </div>
                <div className="dash-hero-meta">
                  <CalendarDays size={18} strokeWidth={1.9} />
                  {formatDate(new Date(), { weekday: true })}
                </div>
              </div>
              <div className="ap-stat-row">
                <div className="ap-stat-card">
                  <div className="top">
                    <div className="ap-stat-ic" style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}>
                      <Clock size={20} strokeWidth={1.9} />
                    </div>
                  </div>
                  <b>{pending.length}</b>
                  <span className="lab">{t('Waiting for approval')}</span>
                </div>
                <div className="ap-stat-card">
                  <div className="top">
                    <div className="ap-stat-ic" style={{ background: 'var(--ok-bg)', color: 'var(--ok)' }}>
                      <ShieldCheck size={20} strokeWidth={1.9} />
                    </div>
                  </div>
                  <b>{approved.length}</b>
                  <span className="lab">{t('Approved passes')}</span>
                </div>
                <div className="ap-stat-card">
                  <div className="top">
                    <div className="ap-stat-ic" style={{ background: '#EFE9FF', color: 'var(--violet-2)' }}>
                      <Users size={20} strokeWidth={1.9} />
                    </div>
                  </div>
                  <b>{visits.length}</b>
                  <span className="lab">{t('Total visit requests')}</span>
                </div>
              </div>
              <div className="ap-panel">
                <div className="ap-panel-head">
                  <div className="ap-panel-title">
                    <span className="ap-panel-ic">
                      <ClipboardList size={16} strokeWidth={2} />
                    </span>
                    <div>
                      <h3>{t('Waiting for a decision')}</h3>
                      <p>{t('New requests from WhatsApp appear here automatically')}</p>
                    </div>
                  </div>
                  <button className="ap-btn ap-btn-ghost ap-btn-sm" onClick={() => switchView('requests')}>
                    {t('View all')}
                  </button>
                </div>
                <div className="ap-req-list">
                  {pending.length ? (
                    pending.map((v) => <ReqCard key={v.id} v={v} onDecide={decide} busy={deciding} />)
                  ) : (
                    <div className="ap-empty">
                      <EmptyState icon={CheckCircle2}>{t('No requests waiting right now')}</EmptyState>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className={'ap-view' + (view === 'requests' ? ' active' : '')}>
              <div className="ap-panel">
                <div className="ap-panel-head">
                  <div className="ap-panel-title">
                    <span className="ap-panel-ic">
                      <ClipboardList size={16} strokeWidth={2} />
                    </span>
                    <div>
                      <h3>{t('Visit requests')}</h3>
                      <p>{t('All company visit requests, newest first')}</p>
                    </div>
                  </div>
                  {pending.length ? <span className="ap-badge pending">{t('{count} pending', { count: pending.length })}</span> : null}
                </div>
                <div className="ap-req-list">
                  {visits.length ? (
                    visits.map((v) =>
                      v.status === 'pending' ? (
                        <ReqCard key={v.id} v={v} onDecide={decide} busy={deciding} />
                      ) : (
                        <div className="ap-req-card" key={v.id}>
                          <div className="ap-row-flex">
                            <div className="ap-avatar-sm">{initials(v.visitor)}</div>
                            <div className="ap-req-info">
                              <b>{v.visitor}</b>
                              <VisitMeta v={v} />
                            </div>
                          </div>
                          <Badge status={v.status} />
                        </div>
                      )
                    )
                  ) : (
                    <div className="ap-empty">
                      <EmptyState icon={ClipboardList}>{t('No visit requests yet')}</EmptyState>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className={'ap-view' + (view === 'passes' ? ' active' : '')}>
              <div className="ap-panel">
                <div className="ap-panel-head">
                  <div className="ap-panel-title">
                    <span className="ap-panel-ic">
                      <QrCode size={16} strokeWidth={2} />
                    </span>
                    <div>
                      <h3>{t('Active passes')}</h3>
                      <p>{t('Share these details with security at the gate if needed')}</p>
                    </div>
                  </div>
                </div>
                <div className="ap-passes-grid">
                  {approved.length ? (
                    approved.map((v) => (
                      <div className="ap-pass-card" key={v.id}>
                        <div className="ap-pass-top">
                          <b>{v.ref}</b>
                          <span className="ap-pass-state">{t('Active')}</span>
                        </div>
                        <div className="ap-pass-pin">
                          <span>{t('Visitor')}</span>
                          <b className="ap-pass-name">{v.visitor}</b>
                        </div>
                        <div className="ap-pass-pin">
                          <span>{t('Date')}</span>
                          <b className="ap-pass-name">
                            {fmt.date(v.date)} · {v.time}
                          </b>
                        </div>
                        <div className="ap-pass-pin">
                          <span>{t('Backup PIN')}</span>
                          <b>{v.pin || '—'}</b>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="ap-empty">
                      <EmptyState icon={QrCode}>{t('No active passes right now')}</EmptyState>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className={'ap-view' + (view === 'conversations' ? ' active' : '')}>
              {view === 'conversations' ? <Conversations /> : null}
            </section>

            <section className={'ap-view' + (view === 'agent' ? ' active' : '')}>
              {view === 'agent' ? <Agent onAfterAction={() => fetchHostData({ silent: true })} /> : null}
            </section>

            <section className={'ap-view' + (view === 'whatsapp' ? ' active' : '')}>
              {view === 'whatsapp' ? <WhatsAppLink onToast={onToast} /> : null}
            </section>

            <section className={'ap-view' + (view === 'hosts' ? ' active' : '')}>
              {view === 'hosts' ? <HostDirectory onToast={onToast} /> : null}
            </section>

            <section className={'ap-view' + (view === 'knowledge' ? ' active' : '')}>
              {view === 'knowledge' ? <KnowledgeBase onToast={onToast} /> : null}
            </section>

            <section className={'ap-view' + (view === 'history' ? ' active' : '')}>
              <div className="ap-panel">
                <div className="ap-panel-head">
                  <div className="ap-panel-title">
                    <span className="ap-panel-ic">
                      <History size={16} strokeWidth={2} />
                    </span>
                    <div>
                      <h3>{t('Visit history')}</h3>
                      <p>{t('Every visit on record')}</p>
                    </div>
                  </div>
                </div>
                <div className="ap-table-wrap">
                  <table className="ap-table">
                    <thead>
                      <tr>
                        <th>{t('Visitor')}</th>
                        <th>{t('Host')}</th>
                        <th>{t('Purpose')}</th>
                        <th>{t('Date')}</th>
                        <th>{t('Status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visits.length ? (
                        visits.map((v) => (
                          <tr key={v.id}>
                            <td>
                              <div className="ap-row-flex">
                                <div className="ap-avatar-sm">{initials(v.visitor)}</div>
                                <div>
                                  <div className="ap-cell-main">{v.visitor}</div>
                                  {v.company ? <div className="ap-cell-sub">{v.company}</div> : null}
                                </div>
                              </div>
                            </td>
                            <td>{v.host}</td>
                            <td>{v.purpose}</td>
                            <td className="ap-nowrap">
                              {fmt.date(v.date)} · {v.time}
                            </td>
                            <td>
                              <Badge status={v.status} />
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5" className="ap-empty">
                            <EmptyState icon={History}>{t('No visit history yet')}</EmptyState>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section className={'ap-view' + (view === 'notifications' ? ' active' : '')}>
              <div className="ap-panel">
                <div className="ap-panel-head">
                  <div className="ap-panel-title">
                    <span className="ap-panel-ic">
                      <Bell size={16} strokeWidth={2} />
                    </span>
                    <div>
                      <h3>{t('Notifications')}</h3>
                      <p>{t('New requests and decisions')}</p>
                    </div>
                  </div>
                </div>
                <div className="ap-feed">
                  {notifications.length ? (
                    notifications.map((a, i) => {
                      const isApprove = /Approved/.test(a.action);
                      const isReject = /Rejected/.test(a.action);
                      const bg = isApprove ? 'var(--ok-bg)' : isReject ? 'var(--bad-bg)' : '#EFE9FF';
                      const col = isApprove ? 'var(--ok)' : isReject ? 'var(--bad)' : 'var(--violet-2)';
                      const Icon = isApprove ? Check : isReject ? X : Activity;
                      return (
                        <div className="ap-feed-item" key={a.id || i}>
                          <div className="ap-feed-dot" style={{ background: bg, color: col }}>
                            <Icon size={15} strokeWidth={2.1} />
                          </div>
                          <div>
                            <p>
                              <b>{t(a.action)}</b> — {a.details}
                            </p>
                            <span>{a.time}</span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="ap-empty">
                      <EmptyState icon={Bell}>{t('No notifications yet')}</EmptyState>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className={'ap-view' + (view === 'profile' ? ' active' : '')}>
              <div className="ap-panel">
                <div className="ap-panel-head">
                  <div className="ap-panel-title">
                    <span className="ap-panel-ic">
                      <Settings size={16} strokeWidth={2} />
                    </span>
                    <div>
                      <h3>{t('Your profile')}</h3>
                      <p>{t('Profile details are managed by your administrator.')}</p>
                    </div>
                  </div>
                </div>
                <div className="ap-profile-grid">
                  <div className="ap-f-field">
                    <label>{t('Full name')}</label>
                    <input disabled value={currentUser ? currentUser.name : ''} readOnly />
                  </div>
                  <div className="ap-f-field">
                    <label>{t('Username')}</label>
                    <input disabled value={currentUser ? currentUser.username : ''} readOnly />
                  </div>
                  <div className="ap-f-field">
                    <label>{t('Role')}</label>
                    <input disabled value={currentUser ? t(currentUser.role) : ''} readOnly />
                  </div>
                  <div className="ap-f-field">
                    <label>{t('Department')}</label>
                    <input disabled value={profile?.department || currentUser?.department || '—'} readOnly />
                  </div>
                  <div className="ap-f-field">
                    <label>{t('Language')}</label>
                    <LanguageSwitch className="lang-switch-lg" />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
