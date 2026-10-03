// Roles and what each may do. Platform roles work at the ecosystem level (companies, plans,
// metering, health) and never see a company's daily operations; company roles work only inside
// their own company. Every API route names the permission it needs.

export const PLATFORM_ROLES = ['super_admin', 'platform_support', 'platform_billing'];
export const COMPANY_ROLES = ['company_admin', 'company_manager', 'company_hr', 'company_security'];
export const ROLES = [...PLATFORM_ROLES, ...COMPANY_ROLES];

export const ROLE_LABELS = {
  super_admin: 'Super admin',
  platform_support: 'Support (Tier 1)',
  platform_billing: 'Billing auditor',
  company_admin: 'Company admin',
  company_manager: 'Operations manager',
  company_hr: 'HR / Host directory',
  company_security: 'Security / Reception',
};

const ALL_PLATFORM = PLATFORM_ROLES;
const SUPPORT = ['super_admin', 'platform_support'];
const BILLING = ['super_admin', 'platform_billing'];
const SUPER = ['super_admin'];

const COMPANY_ALL = COMPANY_ROLES;
const OPS = ['company_admin', 'company_manager'];
const HOSTS = ['company_admin', 'company_manager', 'company_hr'];
const GATE = ['company_admin', 'company_manager', 'company_security'];
const ADMIN = ['company_admin'];

export const PERMISSIONS = {
  // Platform
  'platform.dashboard': ALL_PLATFORM,
  'platform.companies.view': ALL_PLATFORM,
  'platform.companies.manage': SUPER, // create, edit profile, appoint admins, suspend, terminate, delete
  'platform.plans.manage': SUPER,
  'platform.metering.view': BILLING,
  'platform.health.view': SUPPORT,
  'platform.impersonate': SUPPORT,
  'platform.announcements.manage': SUPPORT,
  'platform.settings.manage': SUPER,
  'platform.team.manage': SUPER,
  'platform.audit.view': ALL_PLATFORM,

  // Company
  'company.dashboard': ['company_admin', 'company_manager'],
  'visitors.view': OPS,
  'visits.view': OPS,
  'visits.create': OPS,
  'visits.decide': OPS,
  'visits.flag': OPS,
  'passes.view': OPS,
  'passes.revoke': OPS,
  'gate.use': GATE,
  'conversations.view': OPS,
  'conversations.reply': OPS,
  'hosts.view': HOSTS,
  'hosts.manage': HOSTS,
  'feedback.view': OPS,
  'feedback.manage': OPS,
  'service.view': OPS,
  'service.manage': OPS,
  'knowledge.manage': OPS,
  'reports.view': OPS,
  'audit.view': ADMIN,
  'staff.manage': ADMIN,
  'settings.view': ADMIN,
  'settings.manage': ADMIN,
  'whatsapp.manage': ADMIN,
  'account.self': [...ALL_PLATFORM, ...COMPANY_ALL],
};

export function can(role, permission) {
  return Boolean(PERMISSIONS[permission]?.includes(role));
}

export function permissionsFor(role) {
  return Object.keys(PERMISSIONS).filter((p) => PERMISSIONS[p].includes(role));
}

export function isPlatformRole(role) {
  return PLATFORM_ROLES.includes(role);
}
