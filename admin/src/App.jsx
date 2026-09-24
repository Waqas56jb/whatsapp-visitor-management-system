import { useEffect, useState } from 'react';
import {
  Activity,
  Ban,
  BarChart3,
  Building2,
  CalendarDays,
  Check,
  ClipboardList,
  Clock,
  Download,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  MoreHorizontal,
  Plus,
  QrCode,
  RefreshCw,
  ScanLine,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { toast as notify } from 'react-toastify';
import Conversations from './components/Conversations';
import LoginScreen from './components/LoginScreen';
import ScreenLoader from './components/ScreenLoader';
import api, { getAdminToken, setAdminToken } from './api/client';
import { initials } from './lib/db';
import { LanguageSwitch, useI18n } from './i18n';

const TITLES = {
  dashboard: ['Dashboard', 'Visitor activity at a glance'],
  visitors: ['Visitors', 'Everyone who has requested a visit'],
  visits: ['Visit requests', 'Approve, reject, or review bookings'],
  passes: ['QR & Passes', 'Every access pass issued'],
  conversations: ['Conversations', 'Full WhatsApp threads with visitors'],
  hosts: ['Hosts', 'People and departments visitors can book'],
  accounts: ['Client accounts', 'Portal logins for staff'],
  reports: ['Reports', 'Totals and exportable records'],
  audit: ['Audit log', 'Full history of system actions'],
  settings: ['Settings', 'Organisation details and preferences'],
};

const STATUS_LABEL = {
  approved: 'Approved',
  pending: 'Pending',
  rejected: 'Rejected',
  active: 'Active',
  expired: 'Expired',
  used: 'Checked in',
  revoked: 'Revoked',
  blocked: 'Blocked',
  disabled: 'Disabled',
  inactive: 'Inactive',
};

const ROLE_OPTIONS = ['Host', 'Security', 'Client Admin'];

function tokenRef(token) {
  if (!token) return '—';
  if (token.length <= 14) return token;
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}

function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function matches(query, ...fields) {
  if (!query) return true;
  const q = query.toLowerCase();
  return fields.some((f) => String(f ?? '').toLowerCase().includes(q));
}

function Badge({ status }) {
  const { t } = useI18n();
  const cls = STATUS_LABEL[status] ? status : 'active';
  const Icon =
    status === 'blocked'
      ? Ban
      : status === 'approved' || status === 'active' || status === 'used'
        ? Check
        : status === 'pending'
          ? Clock
          : status === 'rejected' || status === 'revoked'
            ? X
            : ShieldCheck;
  return (
    <span className={`badge ${cls}`}>
      <Icon size={11} strokeWidth={2.6} />
      {t(STATUS_LABEL[status] || status)}
    </span>
  );
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

function NavBtn({ active, icon: Icon, children, onClick, count }) {
  return (
    <button className={'sb-link' + (active ? ' active' : '')} onClick={onClick}>
      <span className="ic">
        <Icon size={18} strokeWidth={1.85} />
      </span>
      {children}
      {count ? <span className="sb-count">{count}</span> : null}
    </button>
  );
}

export default function App() {
  const { t, formatDate: formatLocalDate } = useI18n();
  const [loggedIn, setLoggedIn] = useState(false);
  const [view, setView] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [visitFilter, setVisitFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(null);
  const [detail, setDetail] = useState(null);

  const [hName, setHName] = useState('');
  const [hDept, setHDept] = useState('');
  const [hPhone, setHPhone] = useState('');
  const [aName, setAName] = useState('');
  const [aUser, setAUser] = useState('');
  const [aPass, setAPass] = useState('');
  const [aRole, setARole] = useState('Host');
  const [vName, setVName] = useState('');
  const [vCompany, setVCompany] = useState('');
  const [vHost, setVHost] = useState('');
  const [vPurpose, setVPurpose] = useState('');
  const [vDate, setVDate] = useState('');
  const [vTime, setVTime] = useState('');
  const [setOrgName, setSetOrgName] = useState('Botho Innovations');
  const [setPhone, setSetPhone] = useState('');
  const [setEmail, setSetEmail] = useState('');

  const [visits, setVisits] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [visitors, setVisitors] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [audit, setAudit] = useState([]);
  const [pageLoading, setPageLoading] = useState(false);

  function toast(msg, isErr) {
    if (isErr) notify.error(msg);
    else notify.success(msg);
  }

  async function fetchAll({ silent = false } = {}) {
    if (!silent) setPageLoading(true);
    try {
      const [v, h, vis, a, au, s] = await Promise.all([
        api.get('/visits'),
        api.get('/hosts'),
        api.get('/visitors'),
        api.get('/accounts'),
        api.get('/audit'),
        api.get('/settings').catch(() => ({ data: {} })),
      ]);
      setVisits(v.data || []);
      setHosts(h.data || []);
      setVisitors(vis.data || []);
      setAccounts(a.data || []);
      setAudit(au.data || []);
      if (s.data?.orgName) setSetOrgName(s.data.orgName);
      if (s.data?.phone) setSetPhone(s.data.phone);
      if (s.data?.email) setSetEmail(s.data.email);
    } catch {
      toast(t('Could not load data from the server'), true);
    } finally {
      if (!silent) setPageLoading(false);
    }
  }

  useEffect(() => {
    if (getAdminToken() && sessionStorage.getItem('botho_admin_in') === '1') setLoggedIn(true);
  }, []);

  useEffect(() => {
    if (loggedIn) fetchAll();
  }, [loggedIn]);

  useEffect(() => {
    if (hosts.length && !vHost) setVHost(hosts[0].name);
  }, [hosts, vHost]);

  useEffect(() => {
    document.body.classList.toggle('drawer-open', sidebarOpen);
    return () => document.body.classList.remove('drawer-open');
  }, [sidebarOpen]);

  function switchView(name) {
    setView(name);
    setSidebarOpen(false);
  }

  function doLogout() {
    setAdminToken(null);
    sessionStorage.removeItem('botho_admin_in');
    location.reload();
  }

  const closeModal = () => setModal(null);

  const formatDate = (value) => formatLocalDate(value ? String(value).slice(0, 10) : value);

  async function run(action, success, failure) {
    try {
      await action();
      await fetchAll({ silent: true });
      if (success) toast(success);
    } catch (err) {
      toast(err.response?.data?.error || failure, true);
    }
  }

  const blockHost = (id) => run(() => api.patch(`/hosts/${id}/block`), t('Host blocked'), t('Could not block host'));
  const unblockHost = (id) => run(() => api.patch(`/hosts/${id}/unblock`), t('Host unblocked'), t('Could not unblock host'));
  const blockAccount = (id) => run(() => api.patch(`/accounts/${id}/block`), t('Account blocked'), t('Could not block account'));
  const unblockAccount = (id) => run(() => api.patch(`/accounts/${id}/unblock`), t('Account unblocked'), t('Could not unblock account'));
  const revokePass = (id) => run(() => api.post(`/passes/${id}/revoke`), t('Pass revoked'), t('Could not revoke pass'));

  function deleteHost(id, name) {
    if (!window.confirm(t('Delete host {name}? This cannot be undone.', { name }))) return;
    run(() => api.delete(`/hosts/${id}`, { data: { confirm: true } }), t('Host deleted'), t('Could not delete host'));
  }

  function deleteAccount(id, name) {
    if (!window.confirm(t('Delete account {name}? This cannot be undone.', { name }))) return;
    run(() => api.delete(`/accounts/${id}`, { data: { confirm: true } }), t('Account deleted'), t('Could not delete account'));
  }

  function decideVisit(id, decision) {
    run(
      () => api.patch(`/visits/${id}/${decision === 'approved' ? 'approve' : 'reject'}`),
      decision === 'approved' ? t('Visit approved — the QR pass was sent on WhatsApp') : t('Visit rejected — the visitor has been told'),
      t('Could not update visit')
    );
  }

  async function saveHost() {
    const name = hName.trim();
    const department = hDept.trim();
    if (!name || !department) {
      toast(t('Please fill in the name and department'), true);
      return;
    }
    try {
      await api.post('/hosts', { name, department, phone: hPhone.trim() });
      closeModal();
      setHName('');
      setHDept('');
      setHPhone('');
      await fetchAll({ silent: true });
      toast(t('Host added'));
    } catch (err) {
      toast(err.response?.data?.error || t('Could not add host'), true);
    }
  }

  async function saveVisit() {
    if (!vName.trim() || !vHost || !vDate) {
      toast(t('Please fill in the visitor name, host, and date'), true);
      return;
    }
    try {
      await api.post('/visits', { name: vName.trim(), company: vCompany.trim(), host: vHost, purpose: vPurpose.trim(), date: vDate, time: vTime });
      closeModal();
      setVName('');
      setVCompany('');
      setVPurpose('');
      setVDate('');
      setVTime('');
      await fetchAll({ silent: true });
      toast(t('Visit request created'));
    } catch (err) {
      toast(err.response?.data?.error || t('Could not create visit'), true);
    }
  }

  async function saveAccount() {
    if (!aName.trim() || !aUser.trim() || !aPass) {
      toast(t('Please fill in every field'), true);
      return;
    }
    try {
      await api.post('/accounts', { name: aName.trim(), username: aUser.trim(), password: aPass, role: aRole });
      closeModal();
      setAName('');
      setAUser('');
      setAPass('');
      await fetchAll({ silent: true });
      toast(t('Account created'));
    } catch (err) {
      toast(err.response?.data?.error || t('Could not create account'), true);
    }
  }

  async function saveSettings() {
    try {
      await api.put('/settings', { orgName: setOrgName, phone: setPhone, email: setEmail });
      toast(t('Settings saved'));
    } catch {
      toast(t('Could not save settings'), true);
    }
  }

  async function exportCSV(type) {
    try {
      const res = await api.get(`/reports/export?type=${type}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `botho-${type}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast(t('Export downloaded'));
    } catch {
      toast(t('Nothing to export yet'), true);
    }
  }

  const today = todayStamp();
  const pending = visits.filter((v) => v.status === 'pending');
  const approved = visits.filter((v) => v.status === 'approved');
  const checkedIn = visits.filter((v) => v.status === 'used');
  const visitsToday = visits.filter((v) => String(v.date).slice(0, 10) === today);

  const q = query.trim();
  const shownVisitors = visitors.filter((v) => matches(q, v.name, v.company));
  const shownVisits = visits
    .filter((v) => visitFilter === 'all' || v.status === visitFilter)
    .filter((v) => matches(q, v.ref, v.visitor, v.company, v.host, v.purpose));
  const shownPasses = approved.filter((v) => matches(q, v.ref, v.visitor, v.pin));
  const shownHosts = hosts.filter((h) => matches(q, h.name, h.dept, h.phone));
  const shownAccounts = accounts.filter((a) => matches(q, a.name, a.username, a.role));
  const shownAudit = audit.filter((a) => matches(q, a.actor, a.action, a.details));

  const depts = {};
  visits.forEach((v) => {
    const h = hosts.find((x) => x.name === v.host);
    const d = h?.dept && h.dept !== '—' ? h.dept : t('Unassigned');
    depts[d] = (depts[d] || 0) + 1;
  });
  const maxDept = Math.max(1, ...Object.values(depts));

  const icons = {
    Approved: [Check, 'var(--ok-bg)', 'var(--ok)'],
    Rejected: [X, 'var(--bad-bg)', 'var(--bad)'],
    Validated: [ScanLine, '#EAF3FF', '#2563EB'],
    default: [Activity, '#EFE9FF', 'var(--violet-2)'],
  };

  function openVisitor(v) {
    setDetail({
      title: v.name,
      rows: [
        ['Company', v.company],
        ['Total visits', v.visits],
        ['Last visit', v.lastVisit],
        ['Status', <Badge key="s" status={v.status} />],
      ],
    });
    setModal('detailModal');
  }

  function openVisit(v) {
    setDetail({
      title: v.ref,
      rows: [
        ['Visitor', v.visitor],
        ['Company', v.company || '—'],
        ['Host', v.host],
        ['Purpose', v.purpose],
        ['Date / Time', `${formatDate(v.date)} · ${v.time}`],
        ['Status', <Badge key="s" status={v.status} />],
        ['Backup PIN', v.pin || '—'],
        ['QR token', tokenRef(v.qrToken)],
      ],
    });
    setModal('detailModal');
  }

  const [title, sub] = TITLES[view];

  return (
    <>
      <LoginScreen hidden={loggedIn} onSuccess={() => setLoggedIn(true)} />
      <ScreenLoader show={loggedIn && pageLoading} label={t('Loading dashboard…')} />

      <div id="app" className={loggedIn ? 'on' : ''}>
        <div className={'sidebar-backdrop' + (sidebarOpen ? ' open' : '')} onClick={() => setSidebarOpen(false)} />
        <div className="shell">
          <aside className={'sidebar' + (sidebarOpen ? ' open' : '')} id="sidebar">
            <div className="sb-brand">
              <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
                <defs>
                  <linearGradient id="sbBrandGrad" x1="0" y1="0" x2="40" y2="40">
                    <stop offset="0%" stopColor="#8B6BFF" />
                    <stop offset="100%" stopColor="#22E8C8" />
                  </linearGradient>
                </defs>
                <rect width="40" height="40" rx="11" fill="url(#sbBrandGrad)" />
                <path d="M12 20a8 8 0 1 1 3.2 6.4L11 28l1.4-4.2A8 8 0 0 1 12 20Z" stroke="#0D0822" strokeWidth="2" fill="none" />
                <path d="M17 19.5l2 2 4-4.2" stroke="#0D0822" strokeWidth="2" fill="none" />
              </svg>
              {t('Botho Admin')}
            </div>
            <nav className="sb-nav">
              <NavBtn active={view === 'dashboard'} icon={LayoutDashboard} onClick={() => switchView('dashboard')}>
                {t('Dashboard')}
              </NavBtn>
              <div className="sb-group-label">{t('Visitors')}</div>
              <NavBtn active={view === 'visitors'} icon={Users} onClick={() => switchView('visitors')}>
                {t('Visitors')}
              </NavBtn>
              <NavBtn active={view === 'visits'} icon={ClipboardList} onClick={() => switchView('visits')} count={pending.length}>
                {t('Visit requests')}
              </NavBtn>
              <NavBtn active={view === 'passes'} icon={QrCode} onClick={() => switchView('passes')}>
                {t('QR & Passes')}
              </NavBtn>
              <NavBtn active={view === 'conversations'} icon={MessagesSquare} onClick={() => switchView('conversations')}>
                {t('Conversations')}
              </NavBtn>
              <div className="sb-group-label">{t('People')}</div>
              <NavBtn active={view === 'hosts'} icon={UserCheck} onClick={() => switchView('hosts')}>
                {t('Hosts')}
              </NavBtn>
              <NavBtn active={view === 'accounts'} icon={KeyRound} onClick={() => switchView('accounts')}>
                {t('Client accounts')}
              </NavBtn>
              <div className="sb-group-label">{t('Insights')}</div>
              <NavBtn active={view === 'reports'} icon={BarChart3} onClick={() => switchView('reports')}>
                {t('Reports')}
              </NavBtn>
              <NavBtn active={view === 'audit'} icon={ScrollText} onClick={() => switchView('audit')}>
                {t('Audit log')}
              </NavBtn>
              <NavBtn active={view === 'settings'} icon={Settings} onClick={() => switchView('settings')}>
                {t('Settings')}
              </NavBtn>
            </nav>
            <div className="sb-foot">
              <div className="sb-user">
                <div className="sb-avatar"></div>
                <div>
                  <b>{t('Admin')}</b>
                  <span>{t('Super Admin')}</span>
                </div>
              </div>
              <button className="sb-logout" onClick={doLogout}>
                <LogOut size={15} strokeWidth={2} />
                {t('Sign out')}
              </button>
            </div>
          </aside>

          <main className="main">
            <div className="topbar">
              <div className="topbar-lead">
                <button className="menu-toggle" onClick={() => setSidebarOpen((o) => !o)} aria-label={t('Open menu')}>
                  <Menu size={20} strokeWidth={2} />
                </button>
                <div>
                  <h2>{t(title)}</h2>
                  <p className="sub">{t(sub)}</p>
                </div>
              </div>
              <div className="top-actions">
                <div className="search-box">
                  <Search size={16} strokeWidth={2} />
                  <input
                    placeholder={t('Search visitors, hosts, references…')}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label={t('Search')}
                  />
                  {query ? (
                    <button className="search-clear" type="button" onClick={() => setQuery('')} aria-label={t('Clear search')}>
                      <X size={14} />
                    </button>
                  ) : null}
                </div>
                <LanguageSwitch />
              </div>
            </div>

            <div className="content">
              <section className={'view' + (view === 'dashboard' ? ' active' : '')}>
                <div className="dash-hero">
                  <div>
                    <h3>{t('Welcome back')}</h3>
                    <p>{t('Visitor traffic, pending approvals, and gate activity in one view.')}</p>
                  </div>
                  <div className="dash-hero-meta">
                    <CalendarDays size={18} strokeWidth={1.9} />
                    {formatLocalDate(new Date(), { weekday: true })}
                  </div>
                </div>
                <div className="stat-row">
                  <div className="stat-card">
                    <div className="top">
                      <div className="stat-ic" style={{ background: '#EFE9FF', color: 'var(--violet-2)' }}>
                        <CalendarDays size={20} strokeWidth={1.9} />
                      </div>
                    </div>
                    <b>{visitsToday.length}</b>
                    <span className="lab">{t('Visits scheduled today')}</span>
                  </div>
                  <div className="stat-card">
                    <div className="top">
                      <div className="stat-ic" style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}>
                        <Clock size={20} strokeWidth={1.9} />
                      </div>
                    </div>
                    <b>{pending.length}</b>
                    <span className="lab">{t('Pending approvals')}</span>
                  </div>
                  <div className="stat-card">
                    <div className="top">
                      <div className="stat-ic" style={{ background: 'var(--ok-bg)', color: 'var(--ok)' }}>
                        <ShieldCheck size={20} strokeWidth={1.9} />
                      </div>
                    </div>
                    <b>{approved.length}</b>
                    <span className="lab">{t('Active passes')}</span>
                  </div>
                  <div className="stat-card">
                    <div className="top">
                      <div className="stat-ic" style={{ background: '#EAF3FF', color: '#2563EB' }}>
                        <UserCheck size={20} strokeWidth={1.9} />
                      </div>
                    </div>
                    <b>{hosts.filter((h) => h.status === 'active').length}</b>
                    <span className="lab">{t('Active hosts')}</span>
                  </div>
                </div>

                <div className="grid-2">
                  <div className="panel">
                    <div className="panel-head">
                      <div className="panel-title">
                        <span className="panel-ic">
                          <ClipboardList size={16} strokeWidth={2} />
                        </span>
                        <div>
                          <h3>{t('Recent visit requests')}</h3>
                          <p>{t('Latest bookings across all hosts')}</p>
                        </div>
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={() => switchView('visits')}>
                        {t('View all')}
                      </button>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>{t('Visitor')}</th>
                            <th>{t('Host')}</th>
                            <th>{t('Date')}</th>
                            <th>{t('Status')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visits.length ? (
                            visits.slice(0, 5).map((v) => (
                              <tr key={v.id}>
                                <td data-label={t('Visitor')}>
                                  <div className="row-flex">
                                    <div className="avatar-sm">{initials(v.visitor)}</div>
                                    <div>
                                      <div className="cell-main">{v.visitor}</div>
                                      <div className="cell-sub">{v.ref}</div>
                                    </div>
                                  </div>
                                </td>
                                <td data-label={t('Host')}>{v.host}</td>
                                <td data-label={t('Date')}>{formatDate(v.date)}</td>
                                <td data-label={t('Status')}>
                                  <Badge status={v.status} />
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="4" className="empty">
                                <EmptyState icon={Inbox}>{t('No visit requests yet')}</EmptyState>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="panel">
                    <div className="panel-head">
                      <div className="panel-title">
                        <span className="panel-ic">
                          <Activity size={16} strokeWidth={2} />
                        </span>
                        <div>
                          <h3>{t('Activity feed')}</h3>
                          <p>{t('Latest system events')}</p>
                        </div>
                      </div>
                    </div>
                    <div className="feed">
                      {audit.length ? (
                        audit.slice(0, 6).map((a, i) => {
                          const key = Object.keys(icons).find((k) => a.action.includes(k)) || 'default';
                          const [Icon, bg, col] = icons[key];
                          return (
                            <div className="feed-item" key={i}>
                              <div className="feed-dot" style={{ background: bg, color: col }}>
                                <Icon size={15} strokeWidth={2.1} />
                              </div>
                              <div>
                                <p>
                                  <b>{a.actor}</b> — {t(a.action)}
                                </p>
                                <span>{a.time}</span>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="empty">
                          <EmptyState icon={Clock}>{t('No activity yet')}</EmptyState>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className={'view' + (view === 'visitors' ? ' active' : '')}>
                <div className="panel">
                  <div className="panel-head">
                    <div className="panel-title">
                      <span className="panel-ic">
                        <Users size={16} strokeWidth={2} />
                      </span>
                      <div>
                        <h3>{t('All visitors')}</h3>
                        <p>{t('Everyone who has requested a visit')}</p>
                      </div>
                    </div>
                    <span className="badge active">{t('{count} total', { count: shownVisitors.length })}</span>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t('Visitor')}</th>
                          <th>{t('Company')}</th>
                          <th>{t('Visits')}</th>
                          <th>{t('Last visit')}</th>
                          <th>{t('Status')}</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {shownVisitors.length ? (
                          shownVisitors.map((v) => (
                            <tr key={v.id}>
                              <td data-label={t('Visitor')}>
                                <div className="row-flex">
                                  <div className="avatar-sm">{initials(v.name)}</div>
                                  <div className="cell-main">{v.name}</div>
                                </div>
                              </td>
                              <td data-label={t('Company')}>{v.company}</td>
                              <td data-label={t('Visits')}>{v.visits}</td>
                              <td data-label={t('Last visit')}>{v.lastVisit}</td>
                              <td data-label={t('Status')}>
                                <Badge status={v.status} />
                              </td>
                              <td data-label={t('Actions')}>
                                <button className="btn-icon" onClick={() => openVisitor(v)} aria-label={t('View details')}>
                                  <MoreHorizontal size={16} />
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="6" className="empty">
                              <EmptyState icon={Users}>{q ? t('No results for "{query}"', { query: q }) : t('No visitors yet')}</EmptyState>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className={'view' + (view === 'visits' ? ' active' : '')}>
                <div className="panel">
                  <div className="panel-head">
                    <div className="panel-title">
                      <span className="panel-ic">
                        <ClipboardList size={16} strokeWidth={2} />
                      </span>
                      <div>
                        <h3>{t('Visit requests')}</h3>
                        <p>{t('Approve, reject, or review any request')}</p>
                      </div>
                    </div>
                    <div className="head-actions">
                      <select className="filter-select" value={visitFilter} onChange={(e) => setVisitFilter(e.target.value)} aria-label={t('Filter by status')}>
                        <option value="all">{t('All statuses')}</option>
                        <option value="pending">{t('Pending')}</option>
                        <option value="approved">{t('Approved')}</option>
                        <option value="rejected">{t('Rejected')}</option>
                        <option value="used">{t('Checked in')}</option>
                      </select>
                      <button className="btn btn-violet btn-sm" onClick={() => setModal('visitModal')}>
                        <Plus size={14} strokeWidth={2.4} /> {t('New request')}
                      </button>
                    </div>
                  </div>
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
                        {shownVisits.length ? (
                          shownVisits.map((v) => (
                            <tr key={v.id}>
                              <td className="cell-main nowrap" data-label={t('Reference')}>
                                {v.ref}
                              </td>
                              <td data-label={t('Visitor')}>
                                <div className="cell-main">{v.visitor}</div>
                                {v.company ? <div className="cell-sub">{v.company}</div> : null}
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
                                  {v.status === 'pending' ? (
                                    <>
                                      <button className="btn btn-sm btn-teal" onClick={() => decideVisit(v.id, 'approved')}>
                                        <Check size={13} strokeWidth={2.5} /> {t('Approve')}
                                      </button>
                                      <button className="btn btn-sm btn-danger" onClick={() => decideVisit(v.id, 'rejected')}>
                                        <X size={13} strokeWidth={2.5} /> {t('Reject')}
                                      </button>
                                    </>
                                  ) : (
                                    <button className="btn-icon" onClick={() => openVisit(v)} aria-label={t('View details')}>
                                      <MoreHorizontal size={16} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="7" className="empty">
                              <EmptyState icon={ClipboardList}>{t('No requests match this filter')}</EmptyState>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className={'view' + (view === 'passes' ? ' active' : '')}>
                <div className="panel">
                  <div className="panel-head">
                    <div className="panel-title">
                      <span className="panel-ic">
                        <QrCode size={16} strokeWidth={2} />
                      </span>
                      <div>
                        <h3>{t('QR & access passes')}</h3>
                        <p>{t('Approved passes that can still be used at the gate')}</p>
                      </div>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t('Reference')}</th>
                          <th>{t('Visitor')}</th>
                          <th>{t('Backup PIN')}</th>
                          <th>{t('QR token')}</th>
                          <th>{t('Visit date')}</th>
                          <th>{t('Status')}</th>
                          <th>{t('Actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shownPasses.length ? (
                          shownPasses.map((v) => (
                            <tr key={v.id}>
                              <td className="cell-main nowrap" data-label={t('Reference')}>
                                {v.ref}
                              </td>
                              <td data-label={t('Visitor')}>{v.visitor}</td>
                              <td data-label={t('Backup PIN')}>{v.pin || '—'}</td>
                              <td data-label={t('QR token')}>{tokenRef(v.qrToken)}</td>
                              <td data-label={t('Visit date')}>{formatDate(v.date)}</td>
                              <td data-label={t('Status')}>
                                <Badge status="active" />
                              </td>
                              <td data-label={t('Actions')}>
                                <button className="btn btn-sm btn-danger" onClick={() => revokePass(v.id)}>
                                  <X size={13} strokeWidth={2.5} /> {t('Revoke')}
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="7" className="empty">
                              <EmptyState icon={QrCode}>{t('No active passes')}</EmptyState>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className={'view' + (view === 'conversations' ? ' active' : '')}>
                <div className="panel">
                  <div className="panel-head">
                    <div className="panel-title">
                      <span className="panel-ic">
                        <MessagesSquare size={16} strokeWidth={2} />
                      </span>
                      <div>
                        <h3>{t('WhatsApp conversations')}</h3>
                        <p>{t('Every incoming and outgoing message, grouped by visitor')}</p>
                      </div>
                    </div>
                  </div>
                  {view === 'conversations' ? <Conversations /> : null}
                </div>
              </section>

              <section className={'view' + (view === 'hosts' ? ' active' : '')}>
                <div className="panel">
                  <div className="panel-head">
                    <div className="panel-title">
                      <span className="panel-ic">
                        <UserCheck size={16} strokeWidth={2} />
                      </span>
                      <div>
                        <h3>{t('Hosts')}</h3>
                        <p>{t('Visitors can only book people on this list')}</p>
                      </div>
                    </div>
                    <button className="btn btn-violet btn-sm" onClick={() => setModal('hostModal')}>
                      <Plus size={14} strokeWidth={2.4} /> {t('Add host')}
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t('Host')}</th>
                          <th>{t('Department')}</th>
                          <th>{t('Personal WhatsApp')}</th>
                          <th>{t('Visits hosted')}</th>
                          <th>{t('Status')}</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {shownHosts.length ? (
                          shownHosts.map((h) => (
                            <tr key={h.id}>
                              <td data-label={t('Host')}>
                                <div className="row-flex">
                                  <div className="avatar-sm">{initials(h.name)}</div>
                                  <div className="cell-main">{h.name}</div>
                                </div>
                              </td>
                              <td data-label={t('Department')}>{h.dept && h.dept !== '—' ? h.dept : '—'}</td>
                              <td data-label={t('Personal WhatsApp')} className="nowrap">
                                {h.phone ? `+${String(h.phone).replace(/\D/g, '')}` : '—'}
                              </td>
                              <td data-label={t('Visits hosted')}>{visits.filter((v) => v.host === h.name).length}</td>
                              <td data-label={t('Status')}>
                                <Badge status={h.status} />
                              </td>
                              <td data-label={t('Actions')}>
                                <div className="row-actions">
                                  {h.status === 'blocked' ? (
                                    <button className="btn btn-sm btn-ghost" onClick={() => unblockHost(h.id)}>
                                      {t('Unblock')}
                                    </button>
                                  ) : (
                                    <button className="btn btn-sm btn-ghost" onClick={() => blockHost(h.id)}>
                                      {t('Block')}
                                    </button>
                                  )}
                                  <button className="btn btn-sm btn-danger" onClick={() => deleteHost(h.id, h.name)}>
                                    {t('Delete')}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="6" className="empty">
                              <EmptyState icon={UserCheck}>{t('No hosts added yet')}</EmptyState>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className={'view' + (view === 'accounts' ? ' active' : '')}>
                <div className="panel">
                  <div className="panel-head">
                    <div className="panel-title">
                      <span className="panel-ic">
                        <KeyRound size={16} strokeWidth={2} />
                      </span>
                      <div>
                        <h3>{t('Client Portal accounts')}</h3>
                        <p>{t('Create the username and password staff use to sign in to the Client Portal')}</p>
                      </div>
                    </div>
                    <button className="btn btn-violet btn-sm" onClick={() => setModal('accountModal')}>
                      <UserPlus size={14} strokeWidth={2.4} /> {t('Create account')}
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t('Name')}</th>
                          <th>{t('Username')}</th>
                          <th>{t('Role')}</th>
                          <th>{t('Created')}</th>
                          <th>{t('Status')}</th>
                          <th>{t('Actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shownAccounts.length ? (
                          shownAccounts.map((a) => (
                            <tr key={a.id}>
                              <td className="cell-main" data-label={t('Name')}>
                                {a.name}
                              </td>
                              <td data-label={t('Username')}>{a.username}</td>
                              <td data-label={t('Role')}>{t(a.role)}</td>
                              <td data-label={t('Created')}>{a.created}</td>
                              <td data-label={t('Status')}>
                                <Badge status={a.status} />
                              </td>
                              <td data-label={t('Actions')}>
                                <div className="row-actions">
                                  {a.status === 'blocked' ? (
                                    <button className="btn btn-sm btn-ghost" onClick={() => unblockAccount(a.id)}>
                                      {t('Unblock')}
                                    </button>
                                  ) : (
                                    <button className="btn btn-sm btn-ghost" onClick={() => blockAccount(a.id)}>
                                      {t('Block')}
                                    </button>
                                  )}
                                  <button className="btn btn-sm btn-danger" onClick={() => deleteAccount(a.id, a.name)}>
                                    {t('Delete')}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="6" className="empty">
                              <EmptyState icon={KeyRound}>{t('No accounts yet — create the first one')}</EmptyState>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="mini-note">{t('Share the username and password with the staff member so they can sign in to the Client Portal.')}</p>
                </div>
              </section>

              <section className={'view' + (view === 'reports' ? ' active' : '')}>
                <div className="stat-row">
                  <div className="stat-card">
                    <div className="top">
                      <div className="stat-ic" style={{ background: '#EFE9FF', color: 'var(--violet-2)' }}>
                        <ClipboardList size={20} strokeWidth={1.9} />
                      </div>
                    </div>
                    <b>{visits.length}</b>
                    <span className="lab">{t('Total visit requests')}</span>
                  </div>
                  <div className="stat-card">
                    <div className="top">
                      <div className="stat-ic" style={{ background: 'var(--ok-bg)', color: 'var(--ok)' }}>
                        <Check size={20} strokeWidth={1.9} />
                      </div>
                    </div>
                    <b>{approved.length + checkedIn.length}</b>
                    <span className="lab">{t('Approved')}</span>
                  </div>
                  <div className="stat-card">
                    <div className="top">
                      <div className="stat-ic" style={{ background: 'var(--bad-bg)', color: 'var(--bad)' }}>
                        <X size={20} strokeWidth={1.9} />
                      </div>
                    </div>
                    <b>{visits.filter((v) => v.status === 'rejected').length}</b>
                    <span className="lab">{t('Rejected')}</span>
                  </div>
                  <div className="stat-card">
                    <div className="top">
                      <div className="stat-ic" style={{ background: '#EAF3FF', color: '#2563EB' }}>
                        <ScanLine size={20} strokeWidth={1.9} />
                      </div>
                    </div>
                    <b>{checkedIn.length}</b>
                    <span className="lab">{t('Checked in at the gate')}</span>
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-head">
                    <div className="panel-title">
                      <span className="panel-ic">
                        <Download size={16} strokeWidth={2} />
                      </span>
                      <div>
                        <h3>{t('Export data')}</h3>
                        <p>{t('Download records for compliance or offline review')}</p>
                      </div>
                    </div>
                  </div>
                  <div className="export-row">
                    <button className="btn btn-ghost" onClick={() => exportCSV('visits')}>
                      <Download size={15} /> {t('Visits (CSV)')}
                    </button>
                    <button className="btn btn-ghost" onClick={() => exportCSV('visitors')}>
                      <Download size={15} /> {t('Visitors (CSV)')}
                    </button>
                    <button className="btn btn-ghost" onClick={() => exportCSV('audit')}>
                      <Download size={15} /> {t('Audit log (CSV)')}
                    </button>
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-head">
                    <div className="panel-title">
                      <span className="panel-ic">
                        <Building2 size={16} strokeWidth={2} />
                      </span>
                      <div>
                        <h3>{t('Visits by department')}</h3>
                      </div>
                    </div>
                  </div>
                  <div className="dept-bars">
                    {Object.keys(depts).length ? (
                      Object.entries(depts)
                        .sort((a, b) => b[1] - a[1])
                        .map(([d, c]) => (
                          <div className="dept-bar" key={d}>
                            <div className="dept-bar-head">
                              <span>{d}</span>
                              <b>{c}</b>
                            </div>
                            <div className="dept-bar-track">
                              <div className="dept-bar-fill" style={{ width: `${(c / maxDept) * 100}%` }} />
                            </div>
                          </div>
                        ))
                    ) : (
                      <p className="mini-note" style={{ padding: 0 }}>
                        {t('No data yet')}
                      </p>
                    )}
                  </div>
                </div>
              </section>

              <section className={'view' + (view === 'audit' ? ' active' : '')}>
                <div className="panel">
                  <div className="panel-head">
                    <div className="panel-title">
                      <span className="panel-ic">
                        <ScrollText size={16} strokeWidth={2} />
                      </span>
                      <div>
                        <h3>{t('Audit log')}</h3>
                        <p>{t('Every approval, rejection, gate scan, and account change')}</p>
                      </div>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t('Time')}</th>
                          <th>{t('Actor')}</th>
                          <th>{t('Action')}</th>
                          <th>{t('Details')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shownAudit.length ? (
                          shownAudit.map((a, i) => (
                            <tr key={i}>
                              <td className="cell-sub nowrap" data-label={t('Time')}>
                                {a.time}
                              </td>
                              <td className="cell-main" data-label={t('Actor')}>
                                {a.actor}
                              </td>
                              <td data-label={t('Action')}>{t(a.action)}</td>
                              <td className="cell-sub" data-label={t('Details')}>
                                {a.details}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="4" className="empty">
                              <EmptyState icon={ScrollText}>{t('No audit events yet')}</EmptyState>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className={'view' + (view === 'settings' ? ' active' : '')}>
                <div className="panel">
                  <div className="panel-head">
                    <div className="panel-title">
                      <span className="panel-ic">
                        <Building2 size={16} strokeWidth={2} />
                      </span>
                      <div>
                        <h3>{t('Organisation')}</h3>
                      </div>
                    </div>
                  </div>
                  <div className="form-grid">
                    <div className="f-field">
                      <label htmlFor="setOrgName">{t('Organisation name')}</label>
                      <input id="setOrgName" value={setOrgName} onChange={(e) => setSetOrgName(e.target.value)} />
                    </div>
                    <div className="f-field">
                      <label htmlFor="setPhone">{t('Company WhatsApp number')}</label>
                      <input id="setPhone" value={setPhone} onChange={(e) => setSetPhone(e.target.value)} placeholder="+267 71 000 000" />
                    </div>
                    <div className="f-field span2">
                      <label htmlFor="setEmail">{t('Support email')}</label>
                      <input id="setEmail" value={setEmail} onChange={(e) => setSetEmail(e.target.value)} />
                    </div>
                  </div>
                  <div className="form-actions">
                    <button className="btn btn-violet" onClick={saveSettings}>
                      {t('Save changes')}
                    </button>
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-head">
                    <div className="panel-title">
                      <span className="panel-ic">
                        <Settings size={16} strokeWidth={2} />
                      </span>
                      <div>
                        <h3>{t('Preferences')}</h3>
                        <p>{t('Language and data')}</p>
                      </div>
                    </div>
                  </div>
                  <div className="pref-rows">
                    <div className="pref-row">
                      <div>
                        <b>{t('Language')}</b>
                        <p>{t('English is the default. Setswana is available for the whole panel.')}</p>
                      </div>
                      <LanguageSwitch className="lang-switch-lg" />
                    </div>
                    <div className="pref-row">
                      <div>
                        <b>{t('Refresh data')}</b>
                        <p>{t('Reload visits, hosts, and settings from the server')}</p>
                      </div>
                      <button
                        className="btn btn-ghost"
                        onClick={async () => {
                          await fetchAll();
                          toast(t('Data refreshed'));
                        }}
                      >
                        <RefreshCw size={15} /> {t('Refresh')}
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </main>
        </div>
      </div>

      <div className={'modal-bg' + (modal === 'hostModal' ? ' on' : '')} onClick={(e) => e.target === e.currentTarget && closeModal()}>
        <div className="modal" role="dialog" aria-modal="true" aria-label={t('Add a host')}>
          <div className="modal-head">
            <h3>{t('Add a host')}</h3>
            <button className="modal-close" onClick={closeModal} aria-label={t('Close')}>
              <X size={14} strokeWidth={2.2} />
            </button>
          </div>
          <div className="form-grid full">
            <div className="f-field">
              <label htmlFor="hName">{t('Full name')}</label>
              <input id="hName" placeholder="Boikarabelo Ramaretlwa" value={hName} onChange={(e) => setHName(e.target.value)} />
            </div>
            <div className="f-field">
              <label htmlFor="hDept">{t('Department')}</label>
              <input id="hDept" placeholder="Technology Planning" value={hDept} onChange={(e) => setHDept(e.target.value)} />
            </div>
            <div className="f-field">
              <label htmlFor="hPhone">{t('Personal WhatsApp')}</label>
              <input id="hPhone" placeholder="+267 71 000 000" value={hPhone} onChange={(e) => setHPhone(e.target.value)} />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={closeModal}>
              {t('Cancel')}
            </button>
            <button className="btn btn-violet" onClick={saveHost}>
              {t('Add host')}
            </button>
          </div>
        </div>
      </div>

      <div className={'modal-bg' + (modal === 'accountModal' ? ' on' : '')} onClick={(e) => e.target === e.currentTarget && closeModal()}>
        <div className="modal" role="dialog" aria-modal="true" aria-label={t('Create account')}>
          <div className="modal-head">
            <h3>{t('Create account')}</h3>
            <button className="modal-close" onClick={closeModal} aria-label={t('Close')}>
              <X size={14} strokeWidth={2.2} />
            </button>
          </div>
          <div className="form-grid full">
            <div className="f-field">
              <label htmlFor="aName">{t('Name')}</label>
              <input id="aName" placeholder="Michael Ntsima" value={aName} onChange={(e) => setAName(e.target.value)} />
            </div>
            <div className="f-field">
              <label htmlFor="aUser">{t('Username')}</label>
              <input id="aUser" placeholder="michael.n" value={aUser} onChange={(e) => setAUser(e.target.value)} />
            </div>
            <div className="f-field">
              <label htmlFor="aPass">{t('Password')}</label>
              <input id="aPass" type="text" placeholder={t('Set a password')} value={aPass} onChange={(e) => setAPass(e.target.value)} />
            </div>
            <div className="f-field">
              <label htmlFor="aRole">{t('Role')}</label>
              <select id="aRole" value={aRole} onChange={(e) => setARole(e.target.value)}>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {t(r)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={closeModal}>
              {t('Cancel')}
            </button>
            <button className="btn btn-violet" onClick={saveAccount}>
              {t('Create account')}
            </button>
          </div>
        </div>
      </div>

      <div className={'modal-bg' + (modal === 'visitModal' ? ' on' : '')} onClick={(e) => e.target === e.currentTarget && closeModal()}>
        <div className="modal" role="dialog" aria-modal="true" aria-label={t('New visit request')}>
          <div className="modal-head">
            <h3>{t('New visit request')}</h3>
            <button className="modal-close" onClick={closeModal} aria-label={t('Close')}>
              <X size={14} strokeWidth={2.2} />
            </button>
          </div>
          <div className="form-grid full">
            <div className="f-field">
              <label htmlFor="vName">{t('Visitor name')}</label>
              <input id="vName" placeholder={t('Full name')} value={vName} onChange={(e) => setVName(e.target.value)} />
            </div>
            <div className="f-field">
              <label htmlFor="vCompany">{t('Company')}</label>
              <input id="vCompany" placeholder={t('Company / organisation')} value={vCompany} onChange={(e) => setVCompany(e.target.value)} />
            </div>
            <div className="f-field">
              <label htmlFor="vHost">{t('Host')}</label>
              <select id="vHost" value={vHost} onChange={(e) => setVHost(e.target.value)}>
                {hosts.map((h) => (
                  <option value={h.name} key={h.id}>
                    {h.name}
                    {h.dept && h.dept !== '—' ? ` — ${h.dept}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="f-field">
              <label htmlFor="vPurpose">{t('Purpose')}</label>
              <input id="vPurpose" placeholder={t('Reason for the visit')} value={vPurpose} onChange={(e) => setVPurpose(e.target.value)} />
            </div>
            <div className="f-field">
              <label htmlFor="vDate">{t('Date')}</label>
              <input id="vDate" type="date" value={vDate} onChange={(e) => setVDate(e.target.value)} />
            </div>
            <div className="f-field">
              <label htmlFor="vTime">{t('Time')}</label>
              <input id="vTime" type="time" value={vTime} onChange={(e) => setVTime(e.target.value)} />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={closeModal}>
              {t('Cancel')}
            </button>
            <button className="btn btn-violet" onClick={saveVisit}>
              {t('Submit request')}
            </button>
          </div>
        </div>
      </div>

      <div className={'modal-bg' + (modal === 'detailModal' ? ' on' : '')} onClick={(e) => e.target === e.currentTarget && closeModal()}>
        <div className="modal" role="dialog" aria-modal="true" aria-label={detail?.title || t('Details')}>
          <div className="modal-head">
            <h3>{detail?.title || t('Details')}</h3>
            <button className="modal-close" onClick={closeModal} aria-label={t('Close')}>
              <X size={14} strokeWidth={2.2} />
            </button>
          </div>
          <div className="modal-body">
            {(detail?.rows || []).map(([k, v]) => (
              <div className="detail-row" key={k}>
                <span className="k">{t(k)}</span>
                <span className="v">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
