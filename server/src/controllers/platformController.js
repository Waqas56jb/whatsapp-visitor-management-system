// The platform console (super admin and platform sub-admins). Works at the ecosystem level:
// companies, plans, metering, health, announcements, configuration, the platform team and the
// global audit trail. It never shows a company's daily operations (visitors, visits, chats);
// for hands-on help, support staff use "Log in as" (audited).
import { query } from '../config/db.js';
import { T } from '../config/tables.js';
import { FEATURES, LIMITS, PLANS, effectiveFeatures, effectiveLimits, planOf } from '../config/plans.js';
import { ROLE_LABELS } from '../config/permissions.js';
import { Admin, Announcement, Audit, Company, CompanyWhatsApp, Usage, meteringByCompany, platformCounts } from '../models/index.js';
import { actorName } from '../middleware/auth.js';
import { describeCompany } from '../services/companyConfig.js';
import { usageOverview, monthStart } from '../services/limits.js';
import { loginScope } from '../services/logins.js';
import { emailConfigured, sendEmails } from '../services/mailer.js';
import { healthSnapshot } from '../services/metrics.js';
import { PLATFORM_DEFAULTS, platformConfig, savePlatformConfig } from '../services/platformConfig.js';
import { runWithTenant } from '../tenant.js';
import { todayStamp } from '../utils/dateParse.js';
import { formatDateNice } from '../utils/mappers.js';
import { pauseCompanyWhatsApp, resumeCompanyWhatsApp, sessionSummary, stopCompanyWhatsApp } from '../whatsapp/connection.js';

const audit = (req, action, details) => Audit.platform({ actor: actorName(req), action, details });

function companyRow(c) {
  const plan = planOf(c);
  return {
    id: c.id,
    name: c.name,
    registrationNumber: c.registration_number,
    domain: c.domain,
    status: c.status,
    statusReason: c.status_reason,
    statusChangedAt: c.status_changed_at,
    plan: c.plan,
    planName: plan.name,
    price: plan.price,
    currency: plan.currency,
    createdAt: c.created_at,
    created: formatDateNice(c.created_at),
    hosts: Number(c.host_count || 0),
    staff: Number(c.staff_count || 0),
    visits: Number(c.visit_count || 0),
    whatsapp: c.whatsapp_status || 'disconnected',
    whatsappPhone: c.whatsapp_phone || null,
    hasOverrides: Boolean(Object.keys(c.feature_overrides?.features || {}).length || Object.keys(c.feature_overrides?.limits || {}).length),
  };
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function loadCompany(id) {
  const company = await Company.findById(id);
  if (!company) throw httpError(404, 'Company not found');
  return company;
}

function cleanDomain(value) {
  const domain = String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw httpError(400, 'Please enter a valid domain, for example acme.co.bw');
  return domain;
}

// ------------------------------------------------------------------ overview

export async function overview(req, res) {
  const counts = await platformCounts();
  const companies = await Company.list();
  const active = companies.filter((c) => c.status === 'active');
  const mrr = active.reduce((sum, c) => sum + planOf(c).price, 0);
  const byPlan = Object.keys(PLANS).map((key) => ({ plan: key, name: PLANS[key].name, count: companies.filter((c) => c.plan === key).length }));
  const since = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const [visitsByDay, growth, usage] = await Promise.all([
    query(`SELECT created_at::date AS day, COUNT(*)::int AS visits FROM ${T.visits} WHERE created_at >= $1::date GROUP BY day ORDER BY day`, [since]),
    query(`SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COUNT(*)::int AS companies FROM ${T.companies} GROUP BY month ORDER BY month`),
    Usage.dailyTotals(since),
  ]);
  const top = [...companies].sort((a, b) => Number(b.visit_count) - Number(a.visit_count)).slice(0, 5).map(companyRow);
  res.json({
    counts,
    mrr,
    currency: 'BWP',
    byPlan,
    visitsByDay: visitsByDay.map((r) => ({ day: String(r.day).slice(0, 10), visits: r.visits })),
    growth,
    usage: usage.map((u) => ({ day: String(u.day).slice(0, 10), metric: u.metric, value: Number(u.value) })),
    topCompanies: top,
    recentCompanies: [...companies].reverse().slice(0, 5).map(companyRow),
  });
}

// ------------------------------------------------------------------ companies

export async function listCompanies(req, res) {
  res.json((await Company.list()).map(companyRow));
}

export async function getCompany(req, res) {
  const company = await loadCompany(req.params.id);
  const row = (await Company.list()).find((c) => Number(c.id) === Number(company.id));
  const admins = await Admin.listCompany(company.id);
  const usage = await runWithTenant(company.id, () => usageOverview());
  const recentAudit = await Audit.listPlatform({ scope: 'platform', limit: 1000 });
  const d = describeCompany(company);
  res.json({
    ...companyRow(row || company),
    features: effectiveFeatures(company),
    limits: effectiveLimits(company),
    overrides: company.feature_overrides || {},
    usage,
    branding: { displayName: d.branding.displayName, primaryColor: d.branding.primaryColor, hasLogo: Boolean(d.branding.logo) },
    contact: { phone: d.settings.phone, email: d.settings.email, address: d.settings.address },
    admins: admins.map((a) => ({ id: a.id, name: a.name, username: a.username, email: a.email, role: a.role, roleLabel: ROLE_LABELS[a.role], status: a.status })),
    platformEvents: recentAudit
      .filter((a) => String(a.details || '').includes(`#${company.id})`))
      .slice(0, 20)
      .map((a) => ({ time: a.created_at, actor: a.actor, action: a.action, details: a.details })),
  });
}

// Creates the company and appoints its first company admin. The admin's password is returned
// once (generated unless one is given).
export async function createCompany(req, res) {
  const name = String(req.body.name || '').trim();
  if (name.length < 2) throw httpError(400, 'Please enter the company name');
  if (await Company.findByName(name)) throw httpError(409, 'A company with that name already exists');
  const config = await platformConfig();
  const plan = PLANS[req.body.plan] ? req.body.plan : config.defaultPlan || 'starter';
  const admin = req.body.admin || {};
  if (!admin.name || !admin.username) throw httpError(400, "Please enter the company admin's name and username");

  const company = await Company.create({
    name,
    registration_number: String(req.body.registrationNumber || req.body.registration_number || '').trim().slice(0, 60),
    domain: cleanDomain(req.body.domain),
    plan,
    settings: {
      email: String(req.body.contactEmail || admin.email || '').trim(),
      phone: String(req.body.contactPhone || '').trim(),
      defaultLanguage: config.defaultLanguage,
    },
  });
  let created;
  try {
    created = await loginScope(company.id).create({ name: admin.name, username: admin.username, email: admin.email, role: 'company_admin', password: admin.password });
  } catch (err) {
    await Company.remove(company.id);
    throw err;
  }
  await CompanyWhatsApp.ensure(company.id);
  await audit(req, 'Created company', `${name} (#${company.id}) on ${PLANS[plan].name}; company admin ${created.login.username}`);
  await Audit.add({ actor: actorName(req), action: 'Company created by the platform', details: `Company admin: ${created.login.username}`, companyId: company.id });
  res.status(201).json({ company: companyRow(company), admin: created.login, password: created.password });
}

export async function updateCompany(req, res) {
  const company = await loadCompany(req.params.id);
  const fields = {};
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (name.length < 2) throw httpError(400, 'Please enter the company name');
    const other = await Company.findByName(name);
    if (other && Number(other.id) !== Number(company.id)) throw httpError(409, 'A company with that name already exists');
    fields.name = name;
  }
  if (req.body.registrationNumber !== undefined) fields.registration_number = String(req.body.registrationNumber).trim().slice(0, 60);
  if (req.body.domain !== undefined) fields.domain = cleanDomain(req.body.domain);
  const row = await Company.updateProfile(company.id, fields);
  await audit(req, 'Updated company profile', `${row.name} (#${row.id})`);
  res.json(companyRow(row));
}

// Plan and per-company feature/limit overrides.
export async function updateSubscription(req, res) {
  const company = await loadCompany(req.params.id);
  let row = company;
  const changes = [];
  if (req.body.plan !== undefined) {
    if (!PLANS[req.body.plan]) throw httpError(400, 'Unknown plan');
    if (req.body.plan !== company.plan) {
      row = await Company.setPlan(company.id, req.body.plan);
      changes.push(`plan ${PLANS[company.plan]?.name || company.plan} → ${PLANS[req.body.plan].name}`);
    }
  }
  if (req.body.overrides !== undefined) {
    const features = {};
    const limits = {};
    for (const [key, value] of Object.entries(req.body.overrides?.features || {})) {
      if (FEATURES[key] && (value === true || value === false)) features[key] = value;
    }
    for (const [key, value] of Object.entries(req.body.overrides?.limits || {})) {
      if (!LIMITS[key]) continue;
      if (value === null) limits[key] = null;
      else if (value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0) limits[key] = Math.round(Number(value));
    }
    row = await Company.setOverrides(company.id, { features, limits });
    changes.push(`overrides: ${Object.keys(features).length} feature(s), ${Object.keys(limits).length} limit(s)`);
  }
  if (changes.length) await audit(req, 'Changed subscription', `${row.name} (#${row.id}): ${changes.join('; ')}`);
  res.json({ ...companyRow(row), features: effectiveFeatures(row), limits: effectiveLimits(row), overrides: row.feature_overrides });
}

// Suspend (reason required), reactivate, or terminate (typed company name required).
export async function setCompanyStatus(req, res) {
  const company = await loadCompany(req.params.id);
  const status = String(req.body.status || '');
  const reason = String(req.body.reason || '').trim().slice(0, 300);
  if (!['active', 'suspended', 'terminated'].includes(status)) throw httpError(400, 'Unknown status');
  if (company.status === 'terminated' && status !== 'terminated') throw httpError(400, 'A terminated company cannot be reactivated. Create a new company instead.');
  if (status === 'suspended' && !reason) throw httpError(400, 'Please give a reason for the suspension');
  if (status === 'terminated' && String(req.body.confirmName || '').trim() !== company.name) {
    throw httpError(400, 'Type the company name exactly to confirm termination');
  }
  const row = await Company.setStatus(company.id, status, reason);
  if (status === 'suspended') await pauseCompanyWhatsApp(company.id);
  if (status === 'active') await resumeCompanyWhatsApp(company.id).catch((err) => console.error('WhatsApp resume failed:', err.message));
  if (status === 'terminated') await stopCompanyWhatsApp(company.id).catch((err) => console.error('WhatsApp stop failed:', err.message));
  const verb = { active: 'Reactivated company', suspended: 'Suspended company', terminated: 'Terminated company' }[status];
  await audit(req, verb, `${row.name} (#${row.id})${reason ? `: ${reason}` : ''}`);
  await Audit.add({ actor: 'Platform', action: verb, details: reason, companyId: company.id });
  res.json(companyRow(row));
}

// Permanently deletes a company and all of its data. Only a terminated or suspended company,
// and only with the company name typed exactly.
export async function deleteCompany(req, res) {
  const company = await loadCompany(req.params.id);
  if (company.status === 'active') throw httpError(400, 'Suspend or terminate the company before deleting it.');
  if (String(req.body?.confirmName || '').trim() !== company.name) throw httpError(400, 'Type the company name exactly to confirm deletion');
  await stopCompanyWhatsApp(company.id).catch(() => {});
  await Company.remove(company.id);
  await audit(req, 'Deleted company', `${company.name} (#${company.id}) and all of its data`);
  res.json({ ok: true });
}

// Data export (backup) of one company: everything except uploaded files and WhatsApp keys.
export async function exportCompany(req, res) {
  const company = await loadCompany(req.params.id);
  const tables = {
    hosts: T.hosts,
    visitors: T.visitors,
    visits: T.visits,
    feedback: T.feedback,
    serviceRequests: T.serviceRequests,
    handovers: T.handovers,
    knowledge: T.knowledge,
    conversationLog: T.conversationLog,
    audit: T.audit,
  };
  const data = {};
  for (const [key, table] of Object.entries(tables)) {
    data[key] = await query(`SELECT * FROM ${table} WHERE company_id = $1 ORDER BY id`, [company.id]);
  }
  data.staff = (await Admin.listCompany(company.id)).map(({ password_hash, ...rest }) => rest);
  data.documents = await query(`SELECT id, kind, phone, visitor_id, visit_id, service_request_id, mime, file_name, size_bytes, created_at FROM ${T.documents} WHERE company_id = $1`, [company.id]);
  await audit(req, 'Exported company data', `${company.name} (#${company.id})`);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="company-${company.id}-export-${todayStamp()}.json"`);
  res.send(JSON.stringify({ exportedAt: new Date().toISOString(), company, data }, null, 2));
}

// Company admins: appoint another, reset a password (generated, shown once).
export async function appointCompanyAdmin(req, res) {
  const company = await loadCompany(req.params.id);
  const { login, password } = await loginScope(company.id).create({ ...req.body, role: 'company_admin' });
  await audit(req, 'Appointed company admin', `${login.username} for ${company.name} (#${company.id})`);
  await Audit.add({ actor: 'Platform', action: 'Company admin appointed by the platform', details: login.username, companyId: company.id });
  res.status(201).json({ admin: login, password });
}

export async function resetCompanyAdminPassword(req, res) {
  const company = await loadCompany(req.params.id);
  const { target, password } = await loginScope(company.id).resetPassword(req.params.adminId, req.body);
  await audit(req, 'Reset company admin password', `${target.username} of ${company.name} (#${company.id})`);
  res.json({ ok: true, password });
}

export async function setCompanyAdminStatus(req, res) {
  const company = await loadCompany(req.params.id);
  const status = req.body.status === 'blocked' ? 'blocked' : 'active';
  const { target, login } = await loginScope(company.id).setStatus(null, req.params.adminId, status);
  await audit(req, status === 'blocked' ? 'Blocked company login' : 'Unblocked company login', `${target.username} of ${company.name} (#${company.id})`);
  res.json(login);
}

// ------------------------------------------------------------------ plans

export function listPlans(req, res) {
  res.json({
    features: FEATURES,
    limits: LIMITS,
    plans: Object.entries(PLANS).map(([key, p]) => ({ key, ...p })),
  });
}

// ------------------------------------------------------------------ metering & billing

export async function metering(req, res) {
  const month = monthStart();
  const [companies, stored, usage] = await Promise.all([Company.list(), meteringByCompany(month), Usage.sinceByCompany(month)]);
  const usageBy = {};
  for (const u of usage) (usageBy[u.company_id] ||= {})[u.metric] = Number(u.value);
  const messagesBy = Object.fromEntries(stored.messages.map((m) => [m.company_id, m]));
  const visitsBy = Object.fromEntries(stored.visits.map((v) => [v.company_id, Number(v.n)]));
  const rows = companies.map((c) => {
    const s = stored.storage[c.id] || { rows: 0, bytes: 0 };
    const m = messagesBy[c.id] || { incoming: 0, outgoing: 0, bytes: 0 };
    const u = usageBy[c.id] || {};
    const limits = effectiveLimits(c);
    const plan = planOf(c);
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      plan: c.plan,
      planName: plan.name,
      price: c.status === 'active' ? plan.price : 0,
      currency: plan.currency,
      storageBytes: s.bytes,
      storageRows: s.rows,
      storageLimitMb: limits.storage_mb,
      messagesIn: Number(m.incoming),
      messagesOut: Number(m.outgoing),
      messageLimit: limits.messages_per_month,
      visitsThisMonth: visitsBy[c.id] || 0,
      visitLimit: limits.visits_per_month,
      apiRequests: u.api_requests || 0,
      bandwidthBytes: (u.bandwidth_bytes || 0) + Number(m.bytes || 0),
      aiCalls: u.ai_calls || 0,
    };
  });
  res.json({ month, rows, totals: { revenue: rows.reduce((s, r) => s + r.price, 0), currency: 'BWP' } });
}

// ------------------------------------------------------------------ health

export async function health(req, res) {
  const companies = await Company.list();
  const names = Object.fromEntries(companies.map((c) => [c.id, c.name]));
  const sessions = sessionSummary().map((s) => ({ ...s, company: names[s.companyId] || `#${s.companyId}` }));
  res.json(
    await healthSnapshot({
      whatsapp: {
        sessions,
        connected: sessions.filter((s) => s.connected).length,
        linkedCompanies: companies.filter((c) => c.whatsapp_status === 'connected').length,
      },
      email: { configured: emailConfigured() },
      ai: { configured: Boolean(process.env.OPENAI_API_KEY) },
    })
  );
}

// ------------------------------------------------------------------ announcements

function mapAnnouncement(a) {
  const now = Date.now();
  const live = new Date(a.starts_at).getTime() <= now && (!a.ends_at || new Date(a.ends_at).getTime() > now);
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    severity: a.severity,
    startsAt: a.starts_at,
    endsAt: a.ends_at,
    createdBy: a.created_by,
    emailed: a.emailed_count,
    live,
    createdAt: a.created_at,
  };
}

export async function listAnnouncements(req, res) {
  res.json({ items: (await Announcement.list()).map(mapAnnouncement), emailConfigured: emailConfigured() });
}

export async function createAnnouncement(req, res) {
  const title = String(req.body.title || '').trim().slice(0, 140);
  const body = String(req.body.body || '').trim().slice(0, 2000);
  const severity = ['info', 'warning', 'critical'].includes(req.body.severity) ? req.body.severity : 'info';
  if (!title) throw httpError(400, 'Please enter a title');
  const endsAt = req.body.endsAt ? new Date(req.body.endsAt) : null;
  if (endsAt && Number.isNaN(endsAt.getTime())) throw httpError(400, 'Invalid end date');
  const row = await Announcement.create({ title, body, severity, starts_at: null, ends_at: endsAt ? endsAt.toISOString() : null, created_by: actorName(req) });
  let email = { sent: 0, configured: emailConfigured() };
  if (req.body.email) {
    const companies = (await Company.list()).filter((c) => c.status === 'active');
    const recipients = [...new Set((await Admin.companyAdminEmails(companies.map((c) => c.id))).map((r) => r.email))];
    email = await sendEmails(recipients, `[Announcement] ${title}`, `${body}\n\n— ${(await platformConfig()).platformName}`);
    await Announcement.setEmailed(row.id, email.sent);
  }
  await audit(req, 'Published announcement', `${title}${req.body.email ? ` (emailed to ${email.sent})` : ''}`);
  res.status(201).json({ announcement: mapAnnouncement({ ...row, emailed_count: email.sent }), email });
}

export async function endAnnouncement(req, res) {
  const row = await Announcement.end(req.params.id);
  if (!row) throw httpError(404, 'Announcement not found');
  await audit(req, 'Ended announcement', row.title);
  res.json(mapAnnouncement(row));
}

// ------------------------------------------------------------------ platform settings

export async function getPlatformSettings(req, res) {
  res.json({ settings: await platformConfig(true), defaults: PLATFORM_DEFAULTS, emailConfigured: emailConfigured(), databaseBackups: 'Managed by the database host (daily snapshots).' });
}

export async function updatePlatformSettings(req, res) {
  const before = await platformConfig(true);
  const after = await savePlatformConfig(req.body || {});
  const changed = Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]));
  if (changed.length) await audit(req, 'Changed platform settings', changed.join(', '));
  res.json({ settings: after });
}

// ------------------------------------------------------------------ platform team

const team = loginScope(null);

export async function listTeam(req, res) {
  res.json(await team.list());
}

export async function createTeamMember(req, res) {
  const { login, password } = await team.create(req.body);
  await audit(req, 'Added platform team member', `${login.username} (${login.roleLabel})`);
  res.status(201).json({ login, password });
}

export async function changeTeamRole(req, res) {
  const { target, login } = await team.setRole(req.user.adminId, req.params.id, String(req.body.role || ''));
  await audit(req, 'Changed platform role', `${target.username} → ${login.roleLabel}`);
  res.json(login);
}

export async function setTeamStatus(req, res) {
  const status = req.body.status === 'blocked' ? 'blocked' : 'active';
  const { target, login } = await team.setStatus(req.user.adminId, req.params.id, status);
  await audit(req, status === 'blocked' ? 'Blocked platform team member' : 'Unblocked platform team member', target.username);
  res.json(login);
}

export async function deleteTeamMember(req, res) {
  if (req.body?.confirm !== true) throw httpError(400, 'Confirmation required');
  const { target } = await team.remove(req.user.adminId, req.params.id);
  await audit(req, 'Removed platform team member', `${target.username} (${ROLE_LABELS[target.role]})`);
  res.json({ ok: true });
}

export async function resetTeamPassword(req, res) {
  const { target, password } = await team.resetPassword(req.params.id, req.body);
  await audit(req, 'Reset platform team password', target.username);
  res.json({ ok: true, password });
}

// ------------------------------------------------------------------ global audit

// Platform-level actions only (companies, plans, team, settings, impersonation, sign-ins).
// Company audit trails stay inside each company's own panel.
export async function platformAudit(req, res) {
  const rows = await Audit.listPlatform({ scope: 'platform', limit: Math.min(Number(req.query.limit) || 500, 2000) });
  res.json(rows.map((a) => ({ id: a.id, time: a.created_at, actor: a.actor, action: a.action, details: a.details })));
}
