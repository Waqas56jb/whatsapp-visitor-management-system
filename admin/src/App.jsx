import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
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
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { toast as notify } from 'react-toastify';
import Conversations from './components/Conversations';
import LoginScreen from './components/LoginScreen';
import api, { getAdminToken, setAdminToken } from './api/client';
import { initials } from './lib/db';

const titles = {
  dashboard: ['Dashboard', 'Overview of visitor activity today'],
  visitors: ['Visitors', 'Everyone who has ever requested a visit'],
  visits: ['Visit requests', 'Approve, reject or review bookings'],
  passes: ['QR & Passes', 'Every access token issued'],
  conversations: ['Conversations', 'Full WhatsApp threads with visitors'],
  hosts: ['Hosts', 'People who approve visit requests'],
  accounts: ['Client accounts', 'Logins you issue to clients and staff'],
  reports: ['Reports', 'Trends and exportable records'],
  audit: ['Audit log', 'Full history of system actions'],
  settings: ['Settings', 'Organization preferences'],
};

function tokenRef(token) {
  if (!token) return '—';
  if (token.length <= 14) return token;
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}

function Badge({ status }) {
  const map = {
    approved: 'approved',
    pending: 'pending',
    rejected: 'rejected',
    active: 'active',
    expired: 'expired',
    used: 'used',
    revoked: 'revoked',
    blocked: 'blocked',
    disabled: 'disabled',
    inactive: 'inactive',
  };
  const cls = map[status] || 'active';
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
      {status}
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

function NavBtn({ active, icon: Icon, children, onClick }) {
  return (
    <button className={'sb-link' + (active ? ' active' : '')} onClick={onClick}>
      <span className="ic">
        <Icon size={18} strokeWidth={1.85} />
      </span>
      {children}
    </button>
  );
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [view, setView] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [visitFilter, setVisitFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const [detailTitle, setDetailTitle] = useState('Details');
  const [detailBody, setDetailBody] = useState(null);

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
  const [setPhone, setSetPhone] = useState('+27 00 000 0000');
  const [setEmail, setSetEmail] = useState('support@bothoinnovations.com');

  const [visits, setVisits] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [visitors, setVisitors] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [audit, setAudit] = useState([]);

  async function fetchAll() {
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
      toast('Could not load data from the server', true);
    }
  }

  useEffect(() => {
    if (getAdminToken() && sessionStorage.getItem('botho_admin_in') === '1') setLoggedIn(true);
  }, []);

  useEffect(() => {
    if (loggedIn) fetchAll();
  }, [loggedIn]);

  function toast(msg, isErr) {
    if (isErr) notify.error(msg);
    else notify.success(msg);
  }

  function switchView(name) {
    setView(name);
    setSidebarOpen(false);
  }

  function doLogout() {
    setAdminToken(null);
    sessionStorage.removeItem('botho_admin_in');
    location.reload();
  }

  function openModal(id) {
    setModal(id);
  }

  function closeModal() {
    setModal(null);
  }

  function viewVisitorDetail(v) {
    setDetailTitle(v.name);
    setDetailBody(
      <>
        <div className="detail-row">
          <span className="k">Company</span>
          <span className="v">{v.company}</span>
        </div>
        <div className="detail-row">
          <span className="k">Total visits</span>
          <span className="v">{v.visits}</span>
        </div>
        <div className="detail-row">
          <span className="k">Last visit</span>
          <span className="v">{v.lastVisit}</span>
        </div>
        <div className="detail-row">
          <span className="k">Status</span>
          <span className="v">
            <Badge status={v.status} />
          </span>
        </div>
      </>
    );
    openModal('detailModal');
  }

  function viewVisitDetail(v) {
    setDetailTitle(v.ref);
    setDetailBody(
      <>
        <div className="detail-row">
          <span className="k">Visitor</span>
          <span className="v">{v.visitor}</span>
        </div>
        <div className="detail-row">
          <span className="k">Host</span>
          <span className="v">{v.host}</span>
        </div>
        <div className="detail-row">
          <span className="k">Purpose</span>
          <span className="v">{v.purpose}</span>
        </div>
        <div className="detail-row">
          <span className="k">Date / Time</span>
          <span className="v">
            {v.date} · {v.time}
          </span>
        </div>
        <div className="detail-row">
          <span className="k">Status</span>
          <span className="v">
            <Badge status={v.status} />
          </span>
        </div>
        <div className="detail-row">
          <span className="k">QR token</span>
          <span className="v">{tokenRef(v.qrToken)}</span>
        </div>
      </>
    );
    openModal('detailModal');
  }

  async function blockHost(id) {
    try {
      await api.patch(`/hosts/${id}/block`);
      await fetchAll();
      toast('Host blocked');
    } catch {
      toast('Could not block host', true);
    }
  }

  async function unblockHost(id) {
    try {
      await api.patch(`/hosts/${id}/unblock`);
      await fetchAll();
      toast('Host unblocked');
    } catch {
      toast('Could not unblock host', true);
    }
  }

  async function deleteHost(id, name) {
    if (!window.confirm(`Delete host ${name}? This cannot be undone.`)) return;
    try {
      await api.delete(`/hosts/${id}`, { data: { confirm: true } });
      await fetchAll();
      toast('Host deleted');
    } catch (err) {
      toast(err.response?.data?.error || 'Could not delete host', true);
    }
  }

  async function saveHost() {
    const name = hName.trim();
    const dept = hDept.trim();
    const phone = hPhone.trim();
    if (!name || !dept) {
      toast('Please fill in name and department', true);
      return;
    }
    try {
      await api.post('/hosts', { name, department: dept, phone });
      closeModal();
      setHName('');
      setHDept('');
      setHPhone('');
      await fetchAll();
      toast('Host added');
    } catch {
      toast('Could not add host', true);
    }
  }

  async function decideVisit(id, decision) {
    try {
      await api.patch(`/visits/${id}/${decision === 'approved' ? 'approve' : 'reject'}`);
      await fetchAll();
      toast(decision === 'approved' ? 'Visit approved — pass issued' : 'Visit rejected');
    } catch {
      toast('Could not update visit', true);
    }
  }

  function openNewVisitModal() {
    if (hosts.length && !vHost) setVHost(hosts[0].name);
    openModal('visitModal');
  }

  async function saveVisit() {
    const name = vName.trim();
    const company = vCompany.trim();
    const host = vHost;
    const purpose = vPurpose.trim();
    const date = vDate;
    const time = vTime;
    if (!name || !host || !date) {
      toast('Please fill in visitor name, host and date', true);
      return;
    }
    try {
      await api.post('/visits', { name, company, host, purpose, date, time });
      closeModal();
      setVName('');
      setVCompany('');
      setVPurpose('');
      setVDate('');
      setVTime('');
      await fetchAll();
      toast('Visit request created');
    } catch (err) {
      toast(err.response?.data?.error || 'Could not create visit', true);
    }
  }

  async function revokePass(id) {
    try {
      await api.post(`/passes/${id}/revoke`);
      await fetchAll();
      toast('Pass revoked');
    } catch {
      toast('Could not revoke pass', true);
    }
  }

  async function blockAccount(id) {
    try {
      await api.patch(`/accounts/${id}/block`);
      await fetchAll();
      toast('Account blocked');
    } catch {
      toast('Could not block account', true);
    }
  }

  async function unblockAccount(id) {
    try {
      await api.patch(`/accounts/${id}/unblock`);
      await fetchAll();
      toast('Account unblocked');
    } catch {
      toast('Could not unblock account', true);
    }
  }

  async function deleteAccount(id, name) {
    if (!window.confirm(`Delete account ${name}? This cannot be undone.`)) return;
    try {
      await api.delete(`/accounts/${id}`, { data: { confirm: true } });
      await fetchAll();
      toast('Account deleted');
    } catch (err) {
      toast(err.response?.data?.error || 'Could not delete account', true);
    }
  }

  async function saveAccount() {
    const name = aName.trim();
    const username = aUser.trim();
    const password = aPass;
    const role = aRole;
    if (!name || !username || !password) {
      toast('Please fill in every field', true);
      return;
    }
    try {
      await api.post('/accounts', { name, username, password, role });
      closeModal();
      setAName('');
      setAUser('');
      setAPass('');
      await fetchAll();
      toast('Client account created');
    } catch (err) {
      toast(err.response?.data?.error || 'Could not create account', true);
    }
  }

  async function exportCSV(type) {
    try {
      const res = await api.get(`/reports/export?type=${type}`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'botho-' + type + '.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast('Export downloaded');
    } catch {
      toast('Nothing to export yet', true);
    }
  }

  async function resetAllData() {
    if (!confirm('This reloads data from the database. Continue?')) return;
    await fetchAll();
    toast('Data refreshed from the database');
  }

  const filteredVisits = visitFilter === 'all' ? visits : visits.filter((v) => v.status === visitFilter);
  const issued = visits.filter((v) => v.status === 'approved');
  const recent = visits.slice(0, 5);
  const dashAudit = audit.slice(0, 6);
  const icons = { Approved: [Check, 'var(--ok-bg)', 'var(--ok)'], Rejected: [X, 'var(--bad-bg)', 'var(--bad)'], default: [Activity, '#EFE9FF', 'var(--violet-2)'] };

  const depts = {};
  visits.forEach((v) => {
    const h = hosts.find((x) => x.name === v.host);
    const d = h ? h.dept : 'Unassigned';
    depts[d] = (depts[d] || 0) + 1;
  });
  const max = Math.max(1, ...Object.values(depts));

  useEffect(() => {
    if (hosts.length && !vHost) setVHost(hosts[0].name);
  }, [hosts, vHost]);

  return (
    <>
      <LoginScreen hidden={loggedIn} onSuccess={() => setLoggedIn(true)} />

      <div id="app" className={loggedIn ? 'on' : ''}>
        <div className={'sidebar-backdrop' + (sidebarOpen ? ' open' : '')} onClick={() => setSidebarOpen(false)} />
        <div className="shell">
          <aside className={'sidebar' + (sidebarOpen ? ' open' : '')} id="sidebar">
            <div className="sb-brand">
              <svg viewBox="0 0 40 40" fill="none">
                <rect width="40" height="40" rx="11" fill="url(#lg1)" />
                <path d="M12 20a8 8 0 1 1 3.2 6.4L11 28l1.4-4.2A8 8 0 0 1 12 20Z" stroke="#0D0822" strokeWidth="2" fill="none" />
                <path d="M17 19.5l2 2 4-4.2" stroke="#0D0822" strokeWidth="2" fill="none" />
              </svg>
              Botho Admin
            </div>
            <nav className="sb-nav">
              <NavBtn active={view === 'dashboard'} icon={LayoutDashboard} onClick={() => switchView('dashboard')}>
                Dashboard
              </NavBtn>
              <div className="sb-group-label">Visitors</div>
              <NavBtn active={view === 'visitors'} icon={Users} onClick={() => switchView('visitors')}>
                Visitors
              </NavBtn>
              <NavBtn active={view === 'visits'} icon={ClipboardList} onClick={() => switchView('visits')}>
                Visit Requests
              </NavBtn>
              <NavBtn active={view === 'passes'} icon={QrCode} onClick={() => switchView('passes')}>
                QR &amp; Passes
              </NavBtn>
              <NavBtn active={view === 'conversations'} icon={MessagesSquare} onClick={() => switchView('conversations')}>
                Conversations
              </NavBtn>
              <div className="sb-group-label">People</div>
              <NavBtn active={view === 'hosts'} icon={UserCheck} onClick={() => switchView('hosts')}>
                Hosts
              </NavBtn>
              <NavBtn active={view === 'accounts'} icon={KeyRound} onClick={() => switchView('accounts')}>
                Client Accounts
              </NavBtn>
              <div className="sb-group-label">Insights</div>
              <NavBtn active={view === 'reports'} icon={BarChart3} onClick={() => switchView('reports')}>
                Reports
              </NavBtn>
              <NavBtn active={view === 'audit'} icon={ScrollText} onClick={() => switchView('audit')}>
                Audit Log
              </NavBtn>
              <NavBtn active={view === 'settings'} icon={Settings} onClick={() => switchView('settings')}>
                Settings
              </NavBtn>
            </nav>
            <div className="sb-foot">
              <div className="sb-user">
                <div className="sb-avatar"></div>
                <div>
                  <b>Admin</b>
                  <span>Super Admin</span>
                </div>
              </div>
              <button className="sb-logout" onClick={doLogout}>
                <LogOut size={15} strokeWidth={2} />
                Sign out
              </button>
            </div>
          </aside>

          <main className="main">
            <div className="topbar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="menu-toggle" onClick={() => setSidebarOpen((o) => !o)} aria-label="Open menu">
                  <Menu size={20} strokeWidth={2} />
                </button>
        <div>
                  <h2 id="viewTitle">{titles[view][0]}</h2>
                  <p className="sub" id="viewSub">
                    {titles[view][1]}
          </p>
        </div>
              </div>
              <div className="top-actions">
                <div className="search-box">
                  <Search size={16} strokeWidth={2} />
                  <input placeholder="Search visitors, hosts, refs…" id="globalSearch" />
                </div>
              </div>
            </div>

            <div className="content">
              <section className={'view' + (view === 'dashboard' ? ' active' : '')} id="view-dashboard">
                <div className="dash-hero">
                  <div>
                    <span className="dash-kicker">
                      <Sparkles size={14} strokeWidth={2.2} /> Command center
                    </span>
                    <h3>Welcome back</h3>
                    <p>Live visitor traffic, pending approvals, and gate activity in one view.</p>
                  </div>
                  <div className="dash-hero-meta">
                    <CalendarDays size={18} strokeWidth={1.9} />
                    {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                </div>
                <div className="stat-row">
                  <div className="stat-card">
                    <div className="top">
                      <div className="stat-ic" style={{ background: '#EFE9FF', color: 'var(--violet-2)' }}>
                        <Users size={20} strokeWidth={1.9} />
                      </div>
                      <span className="trend up">
                        <TrendingUp size={12} strokeWidth={2.4} /> 12%
                      </span>
                    </div>
                    <b id="statVisitorsToday">{visits.length}</b>
                    <span className="lab">Visitors today</span>
                  </div>
                  <div className="stat-card">
                    <div className="top">
                      <div className="stat-ic" style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}>
                        <Clock size={20} strokeWidth={1.9} />
                      </div>
                    </div>
                    <b id="statPending">{visits.filter((v) => v.status === 'pending').length}</b>
                    <span className="lab">Pending approvals</span>
                  </div>
                  <div className="stat-card">
                    <div className="top">
                      <div className="stat-ic" style={{ background: 'var(--ok-bg)', color: 'var(--ok)' }}>
                        <ShieldCheck size={20} strokeWidth={1.9} />
                      </div>
                    </div>
                    <b id="statOnsite">{visits.filter((v) => v.status === 'approved').length}</b>
                    <span className="lab">Currently on-site</span>
                  </div>
                  <div className="stat-card">
                    <div className="top">
                      <div className="stat-ic" style={{ background: '#EAF3FF', color: '#2563EB' }}>
                        <UserCheck size={20} strokeWidth={1.9} />
                      </div>
                    </div>
                    <b id="statHosts">{hosts.filter((h) => h.status === 'active').length}</b>
                    <span className="lab">Active hosts</span>
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
                          <h3>Recent visit requests</h3>
                          <p>Latest bookings across all hosts</p>
                        </div>
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={() => switchView('visits')}>
                        View all
                      </button>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Visitor</th>
                            <th>Host</th>
                            <th>Date</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody id="dashRecentVisits">
                          {recent.length ? (
                            recent.map((v) => (
                              <tr key={v.id}>
                                <td>
                                  <div className="row-flex">
                                    <div className="avatar-sm">{initials(v.visitor)}</div>
                                    <div>
                                      <div className="cell-main">{v.visitor}</div>
                                      <div className="cell-sub">{v.ref}</div>
                                    </div>
                                  </div>
                                </td>
                                <td>{v.host}</td>
                                <td>{v.date}</td>
                                <td>
                                  <Badge status={v.status} />
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="4" className="empty">
                                <EmptyState icon={Inbox}>No visit requests yet</EmptyState>
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
                          <h3>Activity feed</h3>
                          <p>System events</p>
                        </div>
                      </div>
                    </div>
                    <div className="feed" id="dashFeed">
                      {dashAudit.length ? (
                        dashAudit.map((a, i) => {
                          const key = Object.keys(icons).find((k) => a.action.includes(k)) || 'default';
                          const [Icon, bg, col] = icons[key];
                          return (
                            <div className="feed-item" key={i}>
                              <div className="feed-dot" style={{ background: bg, color: col }}>
                                <Icon size={15} strokeWidth={2.1} />
                              </div>
                              <div>
                                <p>
                                  <b>{a.actor}</b> — {a.action}
                                </p>
                                <span>{a.time}</span>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="empty">
                          <EmptyState icon={Clock}>No activity yet</EmptyState>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className={'view' + (view === 'visitors' ? ' active' : '')} id="view-visitors">
                <div className="panel">
                  <div className="panel-head">
                    <div className="panel-title">
                      <span className="panel-ic">
                        <Users size={16} strokeWidth={2} />
                      </span>
                      <div>
                        <h3>All visitors</h3>
                        <p>Everyone who has requested a visit</p>
                      </div>
                    </div>
                    <span id="visitorCount" className="badge active">
                      {visitors.length} total
                    </span>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Visitor</th>
                          <th>Company</th>
                          <th>Visits</th>
                          <th>Last visit</th>
                          <th>Status</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody id="visitorsTable">
                        {visitors.length ? (
                          visitors.map((v) => (
                            <tr key={v.id}>
                              <td>
                                <div className="row-flex">
                                  <div className="avatar-sm">{initials(v.name)}</div>
                                  <div className="cell-main">{v.name}</div>
                                </div>
                              </td>
                              <td>{v.company}</td>
                              <td>{v.visits}</td>
                              <td>{v.lastVisit}</td>
                              <td>
                                <Badge status={v.status} />
                              </td>
                              <td>
                                <button className="btn-icon" onClick={() => viewVisitorDetail(v)} aria-label="View visitor">
                                  <MoreHorizontal size={16} />
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="6" className="empty">
                              <EmptyState icon={Users}>No visitors yet</EmptyState>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className={'view' + (view === 'visits' ? ' active' : '')} id="view-visits">
                <div className="panel">
                  <div className="panel-head">
                    <div className="panel-title">
                      <span className="panel-ic">
                        <ClipboardList size={16} strokeWidth={2} />
                      </span>
                      <div>
                        <h3>Visit requests</h3>
                        <p>Approve, reject or review any request</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <select
                        id="visitFilter"
                        className="f-field"
                        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 13 }}
                        value={visitFilter}
                        onChange={(e) => setVisitFilter(e.target.value)}
                      >
                        <option value="all">All statuses</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                      </select>
                      <button className="btn btn-violet btn-sm" onClick={openNewVisitModal}>
                        <Plus size={14} strokeWidth={2.4} /> New request
                      </button>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Reference</th>
                          <th>Visitor</th>
                          <th>Host</th>
                          <th>Purpose</th>
                          <th>Date / Time</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody id="visitsTable">
                        {filteredVisits.length ? (
                          filteredVisits.map((v) => (
                            <tr key={v.id}>
                              <td className="cell-main">{v.ref}</td>
                              <td>{v.visitor}</td>
                              <td>{v.host}</td>
                              <td>{v.purpose}</td>
                              <td>
                                {v.date} · {v.time}
                              </td>
                              <td>
                                <Badge status={v.status} />
                              </td>
                              <td>
                                {v.status === 'pending' ? (
                                  <>
                                    <button className="btn btn-sm btn-teal" onClick={() => decideVisit(v.id, 'approved')}>
                                      <Check size={13} strokeWidth={2.5} /> Approve
                                    </button>{' '}
                                    <button className="btn btn-sm btn-danger" onClick={() => decideVisit(v.id, 'rejected')}>
                                      <X size={13} strokeWidth={2.5} /> Reject
                                    </button>
                                  </>
                                ) : (
                                  <button className="btn-icon" onClick={() => viewVisitDetail(v)} aria-label="View visit">
                                    <MoreHorizontal size={16} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="7" className="empty">
                              <EmptyState icon={ClipboardList}>No requests match this filter</EmptyState>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className={'view' + (view === 'passes' ? ' active' : '')} id="view-passes">
                <div className="panel">
                  <div className="panel-head">
                    <div className="panel-title">
                      <span className="panel-ic">
                        <QrCode size={16} strokeWidth={2} />
                      </span>
                      <div>
                        <h3>QR &amp; access passes</h3>
                        <p>Every token issued, with live status</p>
                      </div>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Reference</th>
                          <th>Visitor</th>
                          <th>QR token</th>
                          <th>Issued</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody id="passesTable">
                        {issued.length ? (
                          issued.map((v) => (
                            <tr key={v.id}>
                              <td className="cell-main">{v.ref}</td>
                              <td>{v.visitor}</td>
                              <td>{tokenRef(v.qrToken)}</td>
                              <td>{v.date}</td>
                              <td>
                                <Badge status="active" />
                              </td>
                              <td>
                                <button className="btn btn-sm btn-danger" onClick={() => revokePass(v.id)}>
                                  <X size={13} strokeWidth={2.5} /> Revoke
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="6" className="empty">
                              <EmptyState icon={QrCode}>No passes issued yet</EmptyState>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className={'view' + (view === 'conversations' ? ' active' : '')} id="view-conversations">
                <div className="panel">
                  <div className="panel-head">
                    <div className="panel-title">
                      <span className="panel-ic">
                        <MessagesSquare size={16} strokeWidth={2} />
                      </span>
                      <div>
                        <h3>WhatsApp conversations</h3>
                        <p>Every incoming and outgoing message, grouped by visitor</p>
                      </div>
                    </div>
                  </div>
                  {view === 'conversations' ? <Conversations /> : null}
                </div>
              </section>

              <section className={'view' + (view === 'hosts' ? ' active' : '')} id="view-hosts">
                <div className="panel">
                  <div className="panel-head">
                    <div className="panel-title">
                      <span className="panel-ic">
                        <UserCheck size={16} strokeWidth={2} />
                      </span>
                      <div>
                        <h3>Hosts</h3>
                        <p>Department contacts who approve visits</p>
                      </div>
                    </div>
                    <button className="btn btn-violet btn-sm" onClick={() => openModal('hostModal')}>
                      <Plus size={14} strokeWidth={2.4} /> Add host
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Host</th>
                          <th>Department</th>
                          <th>Phone</th>
                          <th>Visits hosted</th>
                          <th>Status</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody id="hostsTable">
                        {hosts.length ? (
                          hosts.map((h) => {
                            const count = visits.filter((v) => v.host === h.name).length;
                            return (
                              <tr key={h.id}>
                                <td>
                                  <div className="row-flex">
                                    <div className="avatar-sm">{initials(h.name)}</div>
                                    <div className="cell-main">{h.name}</div>
                                  </div>
                                </td>
                                <td>{h.dept}</td>
                                <td>{h.phone}</td>
                                <td>{count}</td>
                                <td>
                                  <Badge status={h.status} />
                                </td>
                                <td>
                                  <div className="row-actions">
                                    {h.status === 'blocked' ? (
                                      <button className="btn btn-sm btn-ghost" onClick={() => unblockHost(h.id)}>
                                        Unblock
                                      </button>
                                    ) : (
                                      <button className="btn btn-sm btn-ghost" onClick={() => blockHost(h.id)}>
                                        Block
                                      </button>
                                    )}
                                    <button className="btn btn-sm btn-danger" onClick={() => deleteHost(h.id, h.name)}>
                                      Delete
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan="6" className="empty">
                              <EmptyState icon={UserCheck}>No hosts added yet</EmptyState>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className={'view' + (view === 'accounts' ? ' active' : '')} id="view-accounts">
                <div className="panel">
                  <div className="panel-head">
                    <div className="panel-title">
                      <span className="panel-ic">
                        <KeyRound size={16} strokeWidth={2} />
                      </span>
                      <div>
                        <h3>Client login accounts</h3>
                        <p>Create the username &amp; password a client uses to sign into the Client Portal</p>
                      </div>
                    </div>
                    <button className="btn btn-violet btn-sm" onClick={() => openModal('accountModal')}>
                      <UserPlus size={14} strokeWidth={2.4} /> Create account
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Client</th>
                          <th>Username</th>
                          <th>Role</th>
                          <th>Created</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody id="accountsTable">
                        {accounts.length ? (
                          accounts.map((a) => (
                            <tr key={a.id}>
                              <td className="cell-main">{a.name}</td>
                              <td>{a.username}</td>
                              <td>{a.role}</td>
                              <td>{a.created}</td>
                              <td>
                                <Badge status={a.status} />
                              </td>
                              <td>
                                <div className="row-actions">
                                  {a.status === 'blocked' ? (
                                    <button className="btn btn-sm btn-ghost" onClick={() => unblockAccount(a.id)}>
                                      Unblock
                                    </button>
                                  ) : (
                                    <button className="btn btn-sm btn-ghost" onClick={() => blockAccount(a.id)}>
                                      Block
                                    </button>
                                  )}
                                  <button className="btn btn-sm btn-danger" onClick={() => deleteAccount(a.id, a.name)}>
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="6" className="empty">
                              <EmptyState icon={KeyRound}>No client accounts yet — create the first one</EmptyState>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="mini-note">Share the username and password with your host so they can sign into the client portal.</p>
                </div>
              </section>

              <section className={'view' + (view === 'reports' ? ' active' : '')} id="view-reports">
                <div className="stat-row">
                  <div className="stat-card">
                    <div className="top">
                      <div className="stat-ic" style={{ background: '#EFE9FF', color: 'var(--violet-2)' }}>
                        <ClipboardList size={20} strokeWidth={1.9} />
                      </div>
                    </div>
                    <b id="repTotal">{visits.length}</b>
                    <span className="lab">Total visits recorded</span>
                  </div>
                  <div className="stat-card">
                    <div className="top">
                      <div className="stat-ic" style={{ background: 'var(--ok-bg)', color: 'var(--ok)' }}>
                        <Check size={20} strokeWidth={1.9} />
                      </div>
                    </div>
                    <b id="repApproved">{visits.filter((v) => v.status === 'approved').length}</b>
                    <span className="lab">Approved</span>
                  </div>
                  <div className="stat-card">
                    <div className="top">
                      <div className="stat-ic" style={{ background: 'var(--bad-bg)', color: 'var(--bad)' }}>
                        <X size={20} strokeWidth={1.9} />
                      </div>
                    </div>
                    <b id="repRejected">{visits.filter((v) => v.status === 'rejected').length}</b>
                    <span className="lab">Rejected</span>
                  </div>
                  <div className="stat-card">
                    <div className="top">
                      <div className="stat-ic" style={{ background: '#EAF3FF', color: '#2563EB' }}>
                        <TrendingUp size={20} strokeWidth={1.9} />
                      </div>
                    </div>
                    <b id="repAvg">96%</b>
                    <span className="lab">Approved within 5 min</span>
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-head">
                    <div className="panel-title">
                      <span className="panel-ic">
                        <Download size={16} strokeWidth={2} />
                      </span>
                      <div>
                        <h3>Export data</h3>
                        <p>Download records for compliance or offline review</p>
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: '22px 24px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <button className="btn btn-ghost" onClick={() => exportCSV('visits')}>
                      <Download size={15} /> Export visits (CSV)
                    </button>
                    <button className="btn btn-ghost" onClick={() => exportCSV('visitors')}>
                      <Download size={15} /> Export visitors (CSV)
                    </button>
                    <button className="btn btn-ghost" onClick={() => exportCSV('audit')}>
                      <Download size={15} /> Export audit log (CSV)
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
                        <h3>Visits by department</h3>
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: '22px 24px' }} id="deptBreakdown">
                    {Object.keys(depts).length ? (
                      Object.entries(depts).map(([d, c]) => (
                        <div style={{ marginBottom: 14 }} key={d}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                            <span>{d}</span>
                            <b>{c}</b>
                          </div>
                          <div style={{ height: 8, borderRadius: 6, background: 'var(--paper)' }}>
                            <div
                              style={{
                                height: '100%',
                                width: (c / max) * 100 + '%',
                                borderRadius: 6,
                                background: 'linear-gradient(90deg,var(--violet),var(--teal))',
                              }}
                            ></div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="mini-note" style={{ padding: 0 }}>
                        No data yet
                      </p>
                    )}
                  </div>
                </div>
      </section>

              <section className={'view' + (view === 'audit' ? ' active' : '')} id="view-audit">
                <div className="panel">
                  <div className="panel-head">
                    <div className="panel-title">
                      <span className="panel-ic">
                        <ScrollText size={16} strokeWidth={2} />
                      </span>
                      <div>
                        <h3>Audit log</h3>
                        <p>Every approval, rejection, scan and account action</p>
                      </div>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Actor</th>
                          <th>Action</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody id="auditTable">
                        {audit.length ? (
                          audit.map((a, i) => (
                            <tr key={i}>
                              <td className="cell-sub">{a.time}</td>
                              <td className="cell-main">{a.actor}</td>
                              <td>{a.action}</td>
                              <td className="cell-sub">{a.details}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="4" className="empty">
                              <EmptyState icon={ScrollText}>No audit events yet</EmptyState>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className={'view' + (view === 'settings' ? ' active' : '')} id="view-settings">
                <div className="panel">
                  <div className="panel-head">
                    <div className="panel-title">
                      <span className="panel-ic">
                        <Building2 size={16} strokeWidth={2} />
                      </span>
                      <div>
                        <h3>Organization</h3>
                      </div>
                    </div>
                  </div>
                  <div className="form-grid">
                    <div className="f-field">
                      <label>Organization name</label>
                      <input id="setOrgName" value={setOrgName} onChange={(e) => setSetOrgName(e.target.value)} />
                    </div>
                    <div className="f-field">
                      <label>WhatsApp business number</label>
                      <input id="setPhone" value={setPhone} onChange={(e) => setSetPhone(e.target.value)} />
                    </div>
                    <div className="f-field span2">
                      <label>Support email</label>
                      <input id="setEmail" value={setEmail} onChange={(e) => setSetEmail(e.target.value)} />
                    </div>
                  </div>
                  <div className="form-actions">
                    <button
                      className="btn btn-violet"
                      onClick={async () => {
                        try {
                          await api.put('/settings', { orgName: setOrgName, phone: setPhone, email: setEmail });
                          toast('Settings saved');
                        } catch {
                          toast('Could not save settings', true);
                        }
                      }}
                    >
                      Save changes
                    </button>
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-head">
                    <div className="panel-title">
                      <span className="panel-ic" style={{ background: 'var(--bad-bg)', color: 'var(--bad)' }}>
                        <AlertTriangle size={16} strokeWidth={2} />
                      </span>
                      <div>
                        <h3>Refresh data</h3>
                        <p>Reload visits, hosts, and settings from the server</p>
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: '22px 24px' }}>
                    <button className="btn btn-danger" onClick={resetAllData}>
                      Refresh from server
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </main>
        </div>
      </div>

      <div
        className={'modal-bg' + (modal === 'hostModal' ? ' on' : '')}
        id="hostModal"
        onClick={(e) => {
          if (e.target.id === 'hostModal') closeModal();
        }}
      >
        <div className="modal">
          <div className="modal-head">
            <h3>Add a host</h3>
            <button className="modal-close" onClick={closeModal} aria-label="Close">
              <X size={14} strokeWidth={2.2} />
            </button>
          </div>
          <div className="form-grid full">
            <div className="f-field">
              <label>Full name</label>
              <input id="hName" placeholder="e.g. Boikarabelo Ramaretlwa" value={hName} onChange={(e) => setHName(e.target.value)} />
            </div>
            <div className="f-field">
              <label>Department</label>
              <input id="hDept" placeholder="e.g. Technology Planning" value={hDept} onChange={(e) => setHDept(e.target.value)} />
            </div>
            <div className="f-field">
              <label>Phone (WhatsApp)</label>
              <input id="hPhone" placeholder="+267 00 000 000" value={hPhone} onChange={(e) => setHPhone(e.target.value)} />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={closeModal}>
              Cancel
            </button>
            <button className="btn btn-violet" onClick={saveHost}>
              Add host
            </button>
          </div>
        </div>
      </div>

      <div
        className={'modal-bg' + (modal === 'accountModal' ? ' on' : '')}
        id="accountModal"
        onClick={(e) => {
          if (e.target.id === 'accountModal') closeModal();
        }}
      >
        <div className="modal">
          <div className="modal-head">
            <h3>Create client account</h3>
            <button className="modal-close" onClick={closeModal} aria-label="Close">
              <X size={14} strokeWidth={2.2} />
            </button>
          </div>
          <div className="form-grid full">
            <div className="f-field">
              <label>Client / company name</label>
              <input id="aName" placeholder="e.g. Michael Ntsima" value={aName} onChange={(e) => setAName(e.target.value)} />
            </div>
            <div className="f-field">
              <label>Username</label>
              <input id="aUser" placeholder="e.g. michael.n" value={aUser} onChange={(e) => setAUser(e.target.value)} />
            </div>
            <div className="f-field">
              <label>Password</label>
              <input id="aPass" type="text" placeholder="Set a password" value={aPass} onChange={(e) => setAPass(e.target.value)} />
            </div>
            <div className="f-field">
              <label>Role</label>
              <select id="aRole" value={aRole} onChange={(e) => setARole(e.target.value)}>
                <option>Host</option>
                <option>Security</option>
                <option>Client Admin</option>
              </select>
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={closeModal}>
              Cancel
            </button>
            <button className="btn btn-violet" onClick={saveAccount}>
              Create account
            </button>
          </div>
        </div>
      </div>

      <div
        className={'modal-bg' + (modal === 'visitModal' ? ' on' : '')}
        id="visitModal"
        onClick={(e) => {
          if (e.target.id === 'visitModal') closeModal();
        }}
      >
        <div className="modal">
          <div className="modal-head">
            <h3>New visit request</h3>
            <button className="modal-close" onClick={closeModal} aria-label="Close">
              <X size={14} strokeWidth={2.2} />
            </button>
          </div>
          <div className="form-grid full">
            <div className="f-field">
              <label>Visitor name</label>
              <input id="vName" placeholder="Full name" value={vName} onChange={(e) => setVName(e.target.value)} />
            </div>
            <div className="f-field">
              <label>Company</label>
              <input id="vCompany" placeholder="Company / organization" value={vCompany} onChange={(e) => setVCompany(e.target.value)} />
            </div>
            <div className="f-field">
              <label>Host</label>
              <select id="vHost" value={vHost} onChange={(e) => setVHost(e.target.value)}>
                {hosts.map((h) => (
                  <option value={h.name} key={h.id}>
                    {h.name} — {h.dept}
                  </option>
                ))}
              </select>
            </div>
            <div className="f-field">
              <label>Purpose</label>
              <input id="vPurpose" placeholder="Reason for visit" value={vPurpose} onChange={(e) => setVPurpose(e.target.value)} />
            </div>
            <div className="f-field">
              <label>Date</label>
              <input id="vDate" type="date" value={vDate} onChange={(e) => setVDate(e.target.value)} />
            </div>
            <div className="f-field">
              <label>Time</label>
              <input id="vTime" type="time" value={vTime} onChange={(e) => setVTime(e.target.value)} />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={closeModal}>
              Cancel
            </button>
            <button className="btn btn-violet" onClick={saveVisit}>
              Submit request
            </button>
          </div>
        </div>
      </div>

      <div
        className={'modal-bg' + (modal === 'detailModal' ? ' on' : '')}
        id="detailModal"
        onClick={(e) => {
          if (e.target.id === 'detailModal') closeModal();
        }}
      >
        <div className="modal">
          <div className="modal-head">
            <h3 id="detailTitle">{detailTitle}</h3>
            <button className="modal-close" onClick={closeModal} aria-label="Close">
              <X size={14} strokeWidth={2.2} />
            </button>
          </div>
          <div className="modal-body" id="detailBody">
            {detailBody}
          </div>
        </div>
      </div>
    </>
  );
}
