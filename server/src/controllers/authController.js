// Sign-in, "who am I", and platform impersonation ("Log in as" a company).
import bcrypt from 'bcryptjs';
import { Admin, Announcement, Audit, Company } from '../models/index.js';
import { can, isPlatformRole, permissionsFor, ROLE_LABELS } from '../config/permissions.js';
import { describeCompany } from '../services/companyConfig.js';
import { platformConfig } from '../services/platformConfig.js';
import { passwordStamp, signToken } from '../utils/jwt.js';

// The token only identifies the login; role, company and status are read from the database on
// every request.
export async function adminToken(admin, extra = {}, hours) {
  const config = await platformConfig();
  const ttl = `${hours || config.sessionHours || 12}h`;
  return signToken({ username: admin.username, adminId: admin.id, pwc: passwordStamp(admin), ...extra }, ttl);
}

const COMPANY_CLOSED = {
  suspended: 'This company account is suspended. Contact the platform administrator.',
  terminated: 'This company account has been terminated.',
};

export async function adminLogin(req, res) {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const admin = username ? await Admin.findByUsername(username) : null;
  if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }
  if ((admin.status || 'active') !== 'active') {
    return res.status(403).json({ error: 'This account has been blocked. Contact your administrator.' });
  }
  if (!isPlatformRole(admin.role)) {
    const company = await Company.findById(admin.company_id);
    if (!company) return res.status(403).json({ error: 'This company no longer exists.' });
    if (company.status !== 'active') return res.status(403).json({ error: COMPANY_CLOSED[company.status] || 'This company is not active.' });
  } else {
    await Audit.platform({ actor: admin.name || admin.username, action: 'Signed in', details: `${admin.username} (${ROLE_LABELS[admin.role]})` }).catch(() => {});
  }
  res.json({ token: await adminToken(admin), admin: { name: admin.name, username: admin.username, role: admin.role } });
}

function companyView(company) {
  if (!company) return null;
  const d = describeCompany(company);
  return {
    id: d.id,
    name: d.name,
    status: d.status,
    plan: d.plan,
    planName: d.planInfo.name,
    features: d.features,
    limits: d.limits,
    branding: d.branding,
    timezone: d.settings.timezone,
  };
}

// The signed-in user, their permissions, their company (with branding and plan features) and
// the platform announcements to show as a banner.
export async function me(req, res) {
  const p = req.principal;
  const [announcements, config] = await Promise.all([Announcement.active().catch(() => []), platformConfig()]);
  res.json({
    name: p.name || p.username,
    username: p.username,
    email: p.email || '',
    role: req.user.role,
    roleLabel: ROLE_LABELS[req.user.role],
    scope: req.user.companyId ? 'company' : 'platform',
    permissions: permissionsFor(req.user.role),
    company: companyView(req.company),
    impersonating: req.user.impersonating
      ? { by: req.user.impersonating.by, byRole: req.user.impersonating.byRole, byRoleLabel: ROLE_LABELS[req.user.impersonating.byRole] }
      : null,
    platform: { name: config.platformName, supportEmail: config.supportEmail, passwordMinLength: config.passwordMinLength },
    announcements: announcements.map((a) => ({ id: a.id, title: a.title, body: a.body, severity: a.severity, startsAt: a.starts_at, endsAt: a.ends_at })),
  });
}

// Platform staff (super admin, support) open a company's panel as its company admin, to help.
// The token is short-lived, every impersonation is in both audit trails, and the panel shows a
// banner while it lasts. Reading the company's daily data stays in the company's audit trail.
export async function impersonate(req, res) {
  if (!can(req.user.realRole, 'platform.impersonate')) return res.status(403).json({ error: 'Forbidden' });
  const company = await Company.findById(req.params.id);
  if (!company) return res.status(404).json({ error: 'Company not found' });
  if (company.status === 'terminated') return res.status(400).json({ error: 'This company has been terminated.' });
  const config = await platformConfig();
  const minutes = config.impersonationMinutes || 60;
  const token = await adminToken(req.principal, { imp: company.id }, minutes / 60);
  const actor = req.user.name || req.user.username;
  await Audit.platform({ actor, action: 'Started impersonation', details: `${company.name} (#${company.id}) for ${minutes} min` });
  await Audit.add({ actor: `${actor} (platform ${ROLE_LABELS[req.user.realRole]})`, action: 'Platform support signed in to this panel', details: `For ${minutes} minutes`, companyId: company.id });
  res.json({ token, company: { id: company.id, name: company.name }, expiresInMinutes: minutes });
}
