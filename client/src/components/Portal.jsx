import { useEffect, useState } from 'react';
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
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import Agent from './Agent';
import Conversations from './Conversations';
import KnowledgeBase from './KnowledgeBase';
import WhatsAppLink from './WhatsAppLink';
import { initials } from '../lib/db';
import api, { setClientToken } from '../api/client';

const titles = {
  overview: ['Overview', 'Welcome back'],
  requests: ['Visit requests', 'Approve or reject bookings sent to you'],
  conversations: ['Conversations', 'WhatsApp threads for your visitors'],
  agent: ['AI Agent', 'Dashboard assistant — approve or review visits'],
  whatsapp: ['WhatsApp', 'Scan to link your number for visitor bookings'],
  knowledge: ['Knowledge base', 'Train greeting and Q&A for the visitor agent'],
  passes: ['My passes', 'Active QR passes for your approved visitors'],
  history: ['History', 'Everyone who has visited you'],
  notifications: ['Notifications', 'Recent updates'],
  profile: ['Profile', 'Your account details'],
};

function Badge({ status }) {
  const Icon = status === 'approved' ? Check : status === 'pending' ? Clock : X;
  return (
    <span className={`ap-badge ${status}`}>
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

function ReqCard({ v, onDecide }) {
  return (
    <div className="ap-req-card">
      <div className="ap-row-flex">
        <div className="ap-avatar-sm">{initials(v.visitor)}</div>
        <div className="ap-req-info">
          <b>{v.visitor}</b>
          <span>
            {v.purpose} · {v.date} at {v.time} · {v.ref}
          </span>
        </div>
      </div>
      <div className="ap-req-actions">
        <button className="ap-btn ap-btn-sm ap-btn-teal" onClick={() => onDecide(v.id, 'approved')}>
          <Check size={13} strokeWidth={2.5} /> Approve
        </button>
        <button className="ap-btn ap-btn-sm ap-btn-danger" onClick={() => onDecide(v.id, 'rejected')}>
          <X size={13} strokeWidth={2.5} /> Reject
        </button>
      </div>
    </div>
  );
}

export default function Portal({ on, currentUser, onBackToSite, onToast }) {
  const [view, setView] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [visits, setVisits] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [profile, setProfile] = useState(null);

  const pending = visits.filter((v) => v.status === 'pending');
  const approved = visits.filter((v) => v.status === 'approved');
  const hostRec = { dept: profile?.department || currentUser?.department || '—' };
  const notifList = notifications;

  async function fetchHostData() {
    if (!on || !currentUser) return;
    try {
      const [v, n, p] = await Promise.all([
        api.get('/host/visits'),
        api.get('/host/notifications'),
        api.get('/host/profile'),
      ]);
      setVisits(v.data || []);
      setNotifications(n.data || []);
      setProfile(p.data || null);
    } catch {
      onToast('Could not load portal data', true);
    }
  }

  useEffect(() => {
    fetchHostData();
  }, [on, currentUser]);

  function switchView(name) {
    setView(name);
    setSidebarOpen(false);
  }

  async function decide(id, decision) {
    try {
      await api.patch(`/host/visits/${id}/${decision === 'approved' ? 'approve' : 'reject'}`);
      const v = visits.find((x) => x.id === id);
      await fetchHostData();
      onToast(decision === 'approved' ? (v?.visitor || 'Visitor') + "'s visit approved — pass issued" : (v?.visitor || 'Visitor') + "'s visit rejected");
    } catch {
      onToast('Could not update this visit', true);
    }
  }

  function doLogout() {
    setClientToken(null);
    sessionStorage.removeItem('botho_client_user');
    location.reload();
  }

  return (
    <div id="app" className={on ? 'on' : ''}>
      <div className={'ap-sidebar-backdrop' + (sidebarOpen ? ' open' : '')} onClick={() => setSidebarOpen(false)} />
      <div className="ap-shell">
        <aside className={'ap-sidebar' + (sidebarOpen ? ' open' : '')} id="apSidebar">
          <div className="ap-brand">
            <svg viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="11" fill="url(#lg2)" />
              <path d="M12 20a8 8 0 1 1 3.2 6.4L11 28l1.4-4.2A8 8 0 0 1 12 20Z" stroke="#0D0822" strokeWidth="2" fill="none" />
              <path d="M17 19.5l2 2 4-4.2" stroke="#0D0822" strokeWidth="2" fill="none" />
            </svg>
            Client Portal
          </div>
          <nav className="ap-nav">
            <button className={'ap-link' + (view === 'overview' ? ' active' : '')} onClick={() => switchView('overview')}>
              <span className="ic">
                <LayoutDashboard size={18} strokeWidth={1.85} />
              </span>
              Overview
            </button>
            <button className={'ap-link' + (view === 'requests' ? ' active' : '')} onClick={() => switchView('requests')}>
              <span className="ic">
                <ClipboardList size={18} strokeWidth={1.85} />
              </span>
              Visit requests
              <span className="ap-sbadge" id="pendingBadge" style={{ display: pending.length ? 'inline-block' : 'none' }}>
                {pending.length || ''}
              </span>
            </button>
            <button className={'ap-link' + (view === 'conversations' ? ' active' : '')} onClick={() => switchView('conversations')}>
              <span className="ic">
                <MessagesSquare size={18} strokeWidth={1.85} />
              </span>
              Conversations
            </button>
            <button className={'ap-link' + (view === 'agent' ? ' active' : '')} onClick={() => switchView('agent')}>
              <span className="ic">
                <Bot size={18} strokeWidth={1.85} />
              </span>
              AI Agent
            </button>
            <button className={'ap-link' + (view === 'whatsapp' ? ' active' : '')} onClick={() => switchView('whatsapp')}>
              <span className="ic">
                <QrCode size={18} strokeWidth={1.85} />
              </span>
              WhatsApp
            </button>
            <button className={'ap-link' + (view === 'knowledge' ? ' active' : '')} onClick={() => switchView('knowledge')}>
              <span className="ic">
                <BookOpen size={18} strokeWidth={1.85} />
              </span>
              Knowledge base
            </button>
            <button className={'ap-link' + (view === 'passes' ? ' active' : '')} onClick={() => switchView('passes')}>
              <span className="ic">
                <QrCode size={18} strokeWidth={1.85} />
              </span>
              My passes
            </button>
            <button className={'ap-link' + (view === 'history' ? ' active' : '')} onClick={() => switchView('history')}>
              <span className="ic">
                <History size={18} strokeWidth={1.85} />
              </span>
              History
            </button>
            <button className={'ap-link' + (view === 'notifications' ? ' active' : '')} onClick={() => switchView('notifications')}>
              <span className="ic">
                <Bell size={18} strokeWidth={1.85} />
              </span>
              Notifications
            </button>
            <button className={'ap-link' + (view === 'profile' ? ' active' : '')} onClick={() => switchView('profile')}>
              <span className="ic">
                <Settings size={18} strokeWidth={1.85} />
              </span>
              Profile
            </button>
          </nav>
          <div className="ap-foot">
            <div className="ap-user">
              <div className="ap-avatar" id="userAvatar">
                {currentUser ? initials(currentUser.name) : '--'}
              </div>
              <div>
                <b id="userName">{currentUser ? currentUser.name : '—'}</b>
                <span id="userRole">{currentUser ? currentUser.role : '—'}</span>
              </div>
            </div>
            <button className="ap-logout" onClick={doLogout}>
              <LogOut size={15} strokeWidth={2} />
              Sign out
            </button>
          </div>
        </aside>

        <main className="ap-main">
          <div className="ap-topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="ap-menu-toggle" onClick={() => setSidebarOpen((o) => !o)} aria-label="Open menu">
                <Menu size={20} strokeWidth={2} />
              </button>
              <div>
                <h2 id="viewTitle">{titles[view][0]}</h2>
                <p className="sub" id="viewSub">
                  {titles[view][1]}
                </p>
              </div>
            </div>
            <button className="ap-btn ap-btn-ghost ap-btn-sm" onClick={onBackToSite}>
              <ArrowLeft size={14} strokeWidth={2.2} /> Back to site
            </button>
          </div>

          <div className="ap-content">
            <section className={'ap-view' + (view === 'overview' ? ' active' : '')} id="view-overview">
              <div className="dash-hero">
                <div>
                  <span className="dash-kicker">
                    <Sparkles size={14} strokeWidth={2.2} /> Host overview
                  </span>
                  <h3>Welcome back{currentUser?.name ? `, ${currentUser.name.split(' ')[0]}` : ''}</h3>
                  <p>Approve visitors, issue passes, and keep your lobby moving.</p>
                </div>
                <div className="dash-hero-meta">
                  <CalendarDays size={18} strokeWidth={1.9} />
                  {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              </div>
              <div className="ap-stat-row">
                <div className="ap-stat-card">
                  <div className="top">
                    <div className="ap-stat-ic" style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}>
                      <Clock size={20} strokeWidth={1.9} />
                    </div>
                  </div>
                  <b id="ovPending">{pending.length}</b>
                  <span className="lab">Pending your approval</span>
                </div>
                <div className="ap-stat-card">
                  <div className="top">
                    <div className="ap-stat-ic" style={{ background: 'var(--ok-bg)', color: 'var(--ok)' }}>
                      <ShieldCheck size={20} strokeWidth={1.9} />
                    </div>
                  </div>
                  <b id="ovApproved">{approved.length}</b>
                  <span className="lab">Approved this month</span>
                </div>
                <div className="ap-stat-card">
                  <div className="top">
                    <div className="ap-stat-ic" style={{ background: '#EFE9FF', color: 'var(--violet-2)' }}>
                      <Users size={20} strokeWidth={1.9} />
                    </div>
                  </div>
                  <b id="ovTotal">{visits.length}</b>
                  <span className="lab">Total visitors hosted</span>
                </div>
              </div>
              <div className="ap-panel">
                <div className="ap-panel-head">
                  <div className="ap-panel-title">
                    <span className="ap-panel-ic">
                      <ClipboardList size={16} strokeWidth={2} />
                    </span>
                    <div>
                      <h3>Awaiting your decision</h3>
                      <p>Approve or reject with one tap</p>
                    </div>
                  </div>
                  <button className="ap-btn ap-btn-ghost ap-btn-sm" onClick={() => switchView('requests')}>
                    View all
                  </button>
                </div>
                <div className="ap-req-list" id="ovRequests">
                  {pending.length ? (
                    pending.map((v) => <ReqCard key={v.id} v={v} onDecide={decide} />)
                  ) : (
                    <div className="ap-empty">
                      <EmptyState icon={CheckCircle2}>Nothing waiting on you right now</EmptyState>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className={'ap-view' + (view === 'requests' ? ' active' : '')} id="view-requests">
              <div className="ap-panel">
                <div className="ap-panel-head">
                  <div className="ap-panel-title">
                    <span className="ap-panel-ic">
                      <ClipboardList size={16} strokeWidth={2} />
                    </span>
                    <div>
                      <h3>Visit requests</h3>
                      <p>Every request routed to you</p>
                    </div>
                  </div>
                </div>
                <div className="ap-req-list" id="allRequests">
                  {visits.length ? (
                    visits.map((v) =>
                      v.status === 'pending' ? (
                        <ReqCard key={v.id} v={v} onDecide={decide} />
                      ) : (
                        <div className="ap-req-card" key={v.id}>
                          <div className="ap-row-flex">
                            <div className="ap-avatar-sm">{initials(v.visitor)}</div>
                            <div className="ap-req-info">
                              <b>{v.visitor}</b>
                              <span>
                                {v.purpose} · {v.date} at {v.time} · {v.ref}
                              </span>
                            </div>
                          </div>
                          <Badge status={v.status} />
                        </div>
                      )
                    )
                  ) : (
                    <div className="ap-empty">
                      <EmptyState icon={ClipboardList}>No visit requests yet</EmptyState>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className={'ap-view' + (view === 'passes' ? ' active' : '')} id="view-passes">
              <div className="ap-panel">
                <div className="ap-panel-head">
                  <div className="ap-panel-title">
                    <span className="ap-panel-ic">
                      <QrCode size={16} strokeWidth={2} />
                    </span>
                    <div>
                      <h3>Active passes for your approved visitors</h3>
                      <p>Share these details with front-desk security if needed</p>
                    </div>
                  </div>
                </div>
                <div style={{ padding: '26px 24px', display: 'flex', flexWrap: 'wrap', gap: 22, justifyContent: 'center' }} id="passesGrid">
                  {approved.length ? (
                    approved.map((v) => (
                      <div className="ap-pass-card" key={v.id}>
                        <div className="ap-pass-top">
                          <b>{v.ref}</b>
                          <span style={{ fontSize: 11, color: 'var(--teal)' }}>ACTIVE</span>
                        </div>
                        <div className="ap-pass-qr"></div>
                        <div className="ap-pass-pin">
                          <span>Visitor</span>
                          <b style={{ fontSize: 15, letterSpacing: 0, color: '#fff' }}>{v.visitor}</b>
                        </div>
                        <div className="ap-pass-pin" style={{ marginTop: 12 }}>
                          <span>QR reference</span>
                          <b style={{ fontSize: 15, letterSpacing: 0 }}>{v.ref}</b>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="ap-empty">
                      <EmptyState icon={QrCode}>No active passes right now</EmptyState>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className={'ap-view' + (view === 'conversations' ? ' active' : '')} id="view-conversations">
              {view === 'conversations' ? <Conversations /> : null}
            </section>

            <section className={'ap-view' + (view === 'agent' ? ' active' : '')} id="view-agent">
              {view === 'agent' ? <Agent onAfterAction={fetchHostData} /> : null}
            </section>

            <section className={'ap-view' + (view === 'whatsapp' ? ' active' : '')} id="view-whatsapp">
              {view === 'whatsapp' ? <WhatsAppLink onToast={onToast} /> : null}
            </section>

            <section className={'ap-view' + (view === 'knowledge' ? ' active' : '')} id="view-knowledge">
              {view === 'knowledge' ? <KnowledgeBase onToast={onToast} /> : null}
            </section>

            <section className={'ap-view' + (view === 'history' ? ' active' : '')} id="view-history">
              <div className="ap-panel">
                <div className="ap-panel-head">
                  <div className="ap-panel-title">
                    <span className="ap-panel-ic">
                      <History size={16} strokeWidth={2} />
                    </span>
                    <div>
                      <h3>Visit history</h3>
                      <p>Everyone who has visited you</p>
                    </div>
                  </div>
                </div>
                <div className="ap-table-wrap">
                  <table className="ap-table">
                    <thead>
                      <tr>
                        <th>Visitor</th>
                        <th>Purpose</th>
                        <th>Date</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody id="historyTable">
                      {visits.length ? (
                        visits.map((v) => (
                          <tr key={v.id}>
                            <td>
                              <div className="ap-row-flex">
                                <div className="ap-avatar-sm">{initials(v.visitor)}</div>
                                <div className="ap-cell-main">{v.visitor}</div>
                              </div>
                            </td>
                            <td>{v.purpose}</td>
                            <td>{v.date}</td>
                            <td>
                              <Badge status={v.status} />
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4" className="ap-empty">
                            <EmptyState icon={History}>No visit history yet</EmptyState>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section className={'ap-view' + (view === 'notifications' ? ' active' : '')} id="view-notifications">
              <div className="ap-panel">
                <div className="ap-panel-head">
                  <div className="ap-panel-title">
                    <span className="ap-panel-ic">
                      <Bell size={16} strokeWidth={2} />
                    </span>
                    <div>
                      <h3>Notifications</h3>
                      <p>Recent updates on your requests</p>
                    </div>
                  </div>
                </div>
                <div className="ap-feed" id="notifFeed">
                  {notifList.length ? (
                    notifList.map((a, i) => {
                      const isApprove = a.action.includes('Approved');
                      const isReject = a.action.includes('Rejected');
                      const bg = isApprove ? 'var(--ok-bg)' : isReject ? 'var(--bad-bg)' : '#EFE9FF';
                      const col = isApprove ? 'var(--ok)' : isReject ? 'var(--bad)' : 'var(--violet-2)';
                      const Icon = isApprove ? Check : isReject ? X : Activity;
                      return (
                        <div className="ap-feed-item" key={i}>
                          <div className="ap-feed-dot" style={{ background: bg, color: col }}>
                            <Icon size={15} strokeWidth={2.1} />
                          </div>
                          <div>
                            <p>
                              {a.action} — {a.details}
                            </p>
                            <span>{a.time}</span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="ap-empty">
                      <EmptyState icon={Bell}>No notifications yet</EmptyState>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className={'ap-view' + (view === 'profile' ? ' active' : '')} id="view-profile">
              <div className="ap-panel">
                <div className="ap-panel-head">
                  <div className="ap-panel-title">
                    <span className="ap-panel-ic">
                      <Settings size={16} strokeWidth={2} />
                    </span>
                    <div>
                      <h3>Your profile</h3>
                    </div>
                  </div>
                </div>
                <div className="ap-profile-grid">
                  <div className="ap-f-field">
                    <label>Full name</label>
                    <input id="pName" disabled value={currentUser ? currentUser.name : ''} readOnly />
                  </div>
                  <div className="ap-f-field">
                    <label>Username</label>
                    <input id="pUser" disabled value={currentUser ? currentUser.username : ''} readOnly />
                  </div>
                  <div className="ap-f-field">
                    <label>Role</label>
                    <input id="pRole" disabled value={currentUser ? currentUser.role : ''} readOnly />
                  </div>
                  <div className="ap-f-field">
                    <label>Department</label>
                    <input id="pDept" disabled value={hostRec ? hostRec.dept : '—'} readOnly />
                  </div>
                </div>
                <p style={{ padding: '0 24px 18px', fontSize: '12.5px', color: 'var(--muted)' }}>
                  Profile details are managed by your administrator in the Admin Panel.
                </p>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
