import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  Building2,
  ClipboardList,
  Gauge,
  KeyRound,
  Layers,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessageSquareHeart,
  MessagesSquare,
  QrCode,
  ScanLine,
  ScrollText,
  Settings,
  ShieldAlert,
  UserCheck,
  UserCog,
  UserRound,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import LoginScreen from './components/LoginScreen';
import ScreenLoader from './components/ScreenLoader';
import api, { clearSession, getAdminToken, stopImpersonation } from './api/client';
import { LanguageSwitch, useI18n } from './i18n';
import { initials } from './ui';
import Account from './pages/Account';
import PlatformOverview from './pages/platform/Overview';
import Companies from './pages/platform/Companies';
import CompanyDetail from './pages/platform/CompanyDetail';
import Plans from './pages/platform/Plans';
import Metering from './pages/platform/Metering';
import Health from './pages/platform/Health';
import Announcements from './pages/platform/Announcements';
import PlatformSettings from './pages/platform/PlatformSettings';
import Team from './pages/platform/Team';
import PlatformAudit from './pages/platform/PlatformAudit';
import Dashboard from './pages/company/Dashboard';
import Visits from './pages/company/Visits';
import Visitors from './pages/company/Visitors';
import Gate from './pages/company/Gate';
import Passes from './pages/company/Passes';
import ConversationsPage from './pages/company/ConversationsPage';
import Feedback from './pages/company/Feedback';
import ServiceRequests from './pages/company/ServiceRequests';
import Hosts from './pages/company/Hosts';
import Knowledge from './pages/company/Knowledge';
import Staff from './pages/company/Staff';
import Reports from './pages/company/Reports';
import Audit from './pages/company/Audit';
import CompanySettings from './pages/company/CompanySettings';

// Each page names the permission it needs (the server checks the same permission) and, for
// company pages, the plan feature it belongs to.
const PLATFORM_PAGES = [
  { key: 'p-overview', label: 'Overview', sub: 'The whole platform at a glance', icon: LayoutDashboard, perm: 'platform.dashboard', el: PlatformOverview },
  { key: 'p-companies', group: 'Tenants', label: 'Companies', sub: 'Create, manage, suspend and remove client companies', icon: Building2, perm: 'platform.companies.view', el: Companies },
  { key: 'p-company', hidden: true, label: 'Company', sub: 'Profile, subscription, admins and lifecycle', icon: Building2, perm: 'platform.companies.view', el: CompanyDetail },
  { key: 'p-plans', group: 'Tenants', label: 'Plans & features', sub: 'Subscription tiers and what each includes', icon: Layers, perm: 'platform.companies.view', el: Plans },
  { key: 'p-metering', group: 'Monitoring', label: 'Metering & billing', sub: 'Storage, messages, API calls and revenue per company', icon: Gauge, perm: 'platform.metering.view', el: Metering },
  { key: 'p-health', group: 'Monitoring', label: 'System health', sub: 'Uptime, load, latency and WhatsApp sessions', icon: Activity, perm: 'platform.health.view', el: Health },
  { key: 'p-announcements', group: 'Support', label: 'Announcements', sub: 'Banners and emails to every company', icon: Megaphone, perm: 'platform.announcements.manage', el: Announcements },
  { key: 'p-settings', group: 'Security', label: 'Platform settings', sub: 'Language, sign-in security and backups', icon: Settings, perm: 'platform.settings.manage', el: PlatformSettings },
  { key: 'p-team', group: 'Security', label: 'Platform team', sub: 'Super admins, support and billing staff', icon: KeyRound, perm: 'platform.team.manage', el: Team },
  { key: 'p-audit', group: 'Security', label: 'Audit log', sub: 'Every platform-level action', icon: ScrollText, perm: 'platform.audit.view', el: PlatformAudit },
];

const COMPANY_PAGES = [
  { key: 'dashboard', label: 'Dashboard', sub: 'Today at a glance', icon: LayoutDashboard, perm: 'company.dashboard', el: Dashboard },
  { key: 'visits', group: 'Visitors', label: 'Visits & appointments', sub: 'Approve, decline, flag or review requests', icon: ClipboardList, perm: 'visits.view', el: Visits, count: 'pending' },
  { key: 'visitors', group: 'Visitors', label: 'Visitors', sub: 'Profiles and visit history', icon: Users, perm: 'visitors.view', el: Visitors },
  { key: 'gate', group: 'Visitors', label: 'Gate & live traffic', sub: 'Check visitors in and out; who is on site', icon: ScanLine, perm: 'gate.use', el: Gate },
  { key: 'passes', group: 'Visitors', label: 'QR & passes', sub: 'Approved passes that can still be used', icon: QrCode, perm: 'passes.view', el: Passes },
  { key: 'conversations', group: 'Visitors', label: 'Conversations', sub: 'WhatsApp chats, staff replies and handovers', icon: MessagesSquare, perm: 'conversations.view', el: ConversationsPage, count: 'handovers' },
  { key: 'feedback', group: 'Engagement', label: 'Feedback', sub: 'Ratings, comments and complaints', icon: MessageSquareHeart, perm: 'feedback.view', feature: 'feedback', el: Feedback },
  { key: 'service', group: 'Engagement', label: 'Service requests', sub: 'Tickets raised on WhatsApp', icon: Wrench, perm: 'service.view', feature: 'service_requests', el: ServiceRequests, count: 'requests' },
  { key: 'hosts', group: 'Organisation', label: 'Hosts', sub: 'People and departments visitors can see', icon: UserCheck, perm: 'hosts.view', el: Hosts },
  { key: 'knowledge', group: 'Organisation', label: 'Knowledge base', sub: 'What the WhatsApp assistant knows', icon: BookOpen, perm: 'knowledge.manage', feature: 'knowledge_base', el: Knowledge },
  { key: 'staff', group: 'Organisation', label: 'Staff & roles', sub: 'Who can sign in, and what each role can do', icon: UserCog, perm: 'staff.manage', el: Staff },
  { key: 'reports', group: 'Insights', label: 'Reports', sub: 'Volumes, peak hours and host activity', icon: BarChart3, perm: 'reports.view', el: Reports },
  { key: 'audit', group: 'Insights', label: 'Audit log', sub: 'Everything that happened in this company', icon: ScrollText, perm: 'audit.view', el: Audit },
  { key: 'settings', group: 'Settings', label: 'Company settings', sub: 'Profile, hours, rules, branding and integrations', icon: Settings, perm: 'settings.view', el: CompanySettings },
];

const ACCOUNT_PAGE = { key: 'account', label: 'My account', sub: 'Your profile, password and language', icon: UserRound, perm: 'account.self', el: Account };

function BrandMark() {
  return (
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
  );
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export default function App() {
  const { t } = useI18n();
  const [loggedIn, setLoggedIn] = useState(() => Boolean(getAdminToken() && sessionStorage.getItem('botho_admin_in') === '1'));
  const [me, setMe] = useState(null);
  const [view, setView] = useState(null);
  const [params, setParams] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [counts, setCounts] = useState({});
  const [dismissed, setDismissed] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('botho_dismissed') || '[]');
    } catch {
      return [];
    }
  });

  async function loadMe() {
    try {
      const { data } = await api.get('/auth/me');
      setMe(data);
      return data;
    } catch (err) {
      if ([401, 403, 503].includes(err.response?.status)) {
        if (err.response?.data?.error) sessionStorage.setItem('botho_login_notice', err.response.data.error);
        logout();
      }
      return null;
    }
  }

  useEffect(() => {
    if (loggedIn) loadMe();
  }, [loggedIn]);

  const pages = useMemo(() => {
    if (!me) return [];
    const list = me.scope === 'platform' ? PLATFORM_PAGES : COMPANY_PAGES;
    const perms = new Set(me.permissions);
    return [...list, ACCOUNT_PAGE].filter((p) => perms.has(p.perm) && (!p.feature || me.company?.features?.[p.feature]));
  }, [me]);

  // Land on the first page the user may open; never stay on one they cannot.
  useEffect(() => {
    if (!pages.length) return;
    if (!view || !pages.some((p) => p.key === view)) setView(pages[0].key);
  }, [pages]);

  // Sidebar counters (pending approvals, open handovers, open tickets).
  useEffect(() => {
    if (!me || me.scope !== 'company') return undefined;
    const perms = new Set(me.permissions);
    async function load() {
      const next = {};
      try {
        if (perms.has('company.dashboard')) {
          const { data } = await api.get('/dashboard');
          next.pending = data.stats.pending;
          next.handovers = data.stats.open_handovers;
          next.requests = data.stats.open_requests;
        }
      } catch {
        /* counters are optional */
      }
      setCounts(next);
    }
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [me]);

  // White-label: the company's colours in its console.
  useEffect(() => {
    const root = document.documentElement;
    const branding = me?.company?.features?.white_label ? me.company.branding : null;
    if (branding?.primaryColor) {
      root.style.setProperty('--violet', branding.primaryColor);
      root.style.setProperty('--violet-2', shade(branding.primaryColor, -24));
      if (branding.accentColor) root.style.setProperty('--teal', branding.accentColor);
    } else {
      root.style.removeProperty('--violet');
      root.style.removeProperty('--violet-2');
      root.style.removeProperty('--teal');
    }
    const name = me?.company?.branding?.displayName || me?.company?.name || me?.platform?.name;
    document.title = name ? `${name} — ${me?.scope === 'platform' ? t('Platform console') : t('Visitor console')}` : 'Visitor Management';
  }, [me]);

  useEffect(() => {
    document.body.classList.toggle('drawer-open', sidebarOpen);
    return () => document.body.classList.remove('drawer-open');
  }, [sidebarOpen]);

  function go(key, next = {}) {
    setView(key);
    setParams(next);
    setSidebarOpen(false);
    window.scrollTo({ top: 0 });
  }

  function logout() {
    clearSession();
    sessionStorage.removeItem('botho_admin_in');
    setMe(null);
    setView(null);
    setLoggedIn(false);
  }

  async function returnToPlatform() {
    stopImpersonation();
    setMe(null);
    setView(null);
    const data = await loadMe();
    if (data) setView('p-companies');
  }

  function dismiss(id) {
    const next = [...dismissed, id];
    setDismissed(next);
    sessionStorage.setItem('botho_dismissed', JSON.stringify(next));
  }

  const page = pages.find((p) => p.key === view) || null;
  const PageEl = page?.el;
  const groups = [];
  for (const p of pages.filter((x) => !x.hidden && x.key !== 'account')) {
    const label = p.group || '';
    let g = groups.find((x) => x.label === label);
    if (!g) groups.push((g = { label, items: [] }));
    g.items.push(p);
  }
  const branding = me?.company?.branding;
  const brandName = me?.scope === 'company' ? branding?.displayName || me.company?.name : me?.platform?.name || 'Botho VMS';
  const showLogo = me?.company?.features?.white_label && branding?.logo;
  const banners = (me?.announcements || []).filter((a) => !dismissed.includes(a.id));

  return (
    <>
      <LoginScreen hidden={loggedIn} onSuccess={() => setLoggedIn(true)} />
      <ScreenLoader show={loggedIn && !me} label={t('Loading your console…')} />

      <div id="app" className={loggedIn && me ? 'on' : ''}>
        <div className={'sidebar-backdrop' + (sidebarOpen ? ' open' : '')} onClick={() => setSidebarOpen(false)} />
        <div className="shell">
          <aside className={'sidebar' + (sidebarOpen ? ' open' : '')} id="sidebar">
            <div className="sb-brand">
              {showLogo ? <img className="sb-logo" src={branding.logo} alt="" /> : <BrandMark />}
              <span className="sb-brand-text">
                {brandName}
                <small>{me?.scope === 'platform' ? t('Platform console') : me?.company?.planName ? t('{plan} plan', { plan: me.company.planName }) : ''}</small>
              </span>
            </div>
            <nav className="sb-nav">
              {groups.map((g) => (
                <div key={g.label || 'main'}>
                  {g.label ? <div className="sb-group-label">{t(g.label)}</div> : null}
                  {g.items.map((p) => {
                    const Icon = p.icon;
                    const active = view === p.key || (p.key === 'p-companies' && view === 'p-company');
                    return (
                      <button key={p.key} className={'sb-link' + (active ? ' active' : '')} onClick={() => go(p.key)}>
                        <span className="ic">
                          <Icon size={18} strokeWidth={1.85} />
                        </span>
                        {t(p.label)}
                        {p.count && counts[p.count] ? <span className="sb-count">{counts[p.count]}</span> : null}
                      </button>
                    );
                  })}
                </div>
              ))}
              <div className="sb-group-label">{t('You')}</div>
              <button className={'sb-link' + (view === 'account' ? ' active' : '')} onClick={() => go('account')}>
                <span className="ic">
                  <UserRound size={18} strokeWidth={1.85} />
                </span>
                {t('My account')}
              </button>
            </nav>
            <div className="sb-foot">
              <div className="sb-user">
                <div className="sb-avatar sb-avatar-text">{initials(me?.name)}</div>
                <div>
                  <b>{me?.name || ''}</b>
                  <span>{me?.roleLabel ? t(me.roleLabel) : ''}</span>
                </div>
              </div>
              <button className="sb-logout" onClick={logout}>
                <LogOut size={15} strokeWidth={2} />
                {t('Sign out')}
              </button>
            </div>
          </aside>

          <main className="main">
            {me?.impersonating ? (
              <div className="imp-banner">
                <ShieldAlert size={16} />
                <span>
                  {t('You are signed in to {company} as its company admin ({role} {user}). Everything you do is recorded in both audit logs.', {
                    company: me.company?.name,
                    role: t(me.impersonating.byRoleLabel),
                    user: me.impersonating.by,
                  })}
                </span>
                <button className="btn btn-sm btn-ghost" onClick={returnToPlatform}>
                  {t('Return to platform')}
                </button>
              </div>
            ) : null}
            {banners.map((a) => (
              <div key={a.id} className={`ann-banner ${a.severity}`}>
                <Megaphone size={16} />
                <div>
                  <b>{a.title}</b>
                  {a.body ? <span> — {a.body}</span> : null}
                </div>
                <button className="ann-close" onClick={() => dismiss(a.id)} aria-label={t('Dismiss')}>
                  <X size={14} />
                </button>
              </div>
            ))}
            <div className="topbar">
              <div className="topbar-lead">
                <button className="menu-toggle" onClick={() => setSidebarOpen((o) => !o)} aria-label={t('Open menu')}>
                  <Menu size={20} strokeWidth={2} />
                </button>
                <div>
                  <h2>{page ? t(page.label) : ''}</h2>
                  <p className="sub">{page ? t(page.sub) : ''}</p>
                </div>
              </div>
              <div className="top-actions">
                <LanguageSwitch />
              </div>
            </div>
            <div className="content">{me && PageEl ? <PageEl key={`${view}-${JSON.stringify(params)}`} me={me} go={go} params={params} refreshMe={loadMe} /> : null}</div>
          </main>
        </div>
      </div>
    </>
  );
}
