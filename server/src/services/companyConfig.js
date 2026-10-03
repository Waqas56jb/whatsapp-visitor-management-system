// A company's own configuration (stored as JSON on the company row): profile and office hours,
// visitation rules, white-label branding, message templates and integrations. Every reader gets
// the same shape with defaults filled in.
import { optionalTenantId } from '../tenant.js';
import { Company } from '../models/index.js';
import { effectiveFeatures, effectiveLimits, planOf } from '../config/plans.js';

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const COMPANY_DEFAULTS = {
  phone: '',
  email: '',
  address: '',
  location: '',
  timezone: 'Africa/Gaborone',
  defaultLanguage: 'en',
  hours: {
    mon: { open: '08:00', close: '17:00', closed: false },
    tue: { open: '08:00', close: '17:00', closed: false },
    wed: { open: '08:00', close: '17:00', closed: false },
    thu: { open: '08:00', close: '17:00', closed: false },
    fri: { open: '08:00', close: '17:00', closed: false },
    sat: { open: '09:00', close: '13:00', closed: true },
    sun: { open: '09:00', close: '13:00', closed: true },
  },
  rules: {
    requireId: 'never', // never | first_visit | every_visit
    requireNda: false,
    ndaText: 'All information you see or hear during your visit is confidential and may not be shared without written permission.',
    healthScreening: false,
    healthQuestions: [
      'Do you have a fever, cough or flu-like symptoms today?',
      'Have you been in contact with anyone with a contagious illness in the last 14 days?',
    ],
  },
  departments: {
    handover: ['Reception', 'Sales', 'IT Support', 'Accounts', 'General Enquiries'],
  },
  templates: {
    welcome: { en: '', tn: '' },
    approved: { en: '', tn: '' },
    goodbye: { en: '', tn: '' },
  },
  integrations: {
    slackWebhook: '',
    slackEvents: { newVisit: true, checkIn: true, complaint: true, serviceRequest: true, handover: true },
    wifi: { enabled: false, ssid: '', password: '' },
  },
};

export const BRANDING_DEFAULTS = {
  displayName: '',
  logo: '', // data URL (PNG/JPEG/SVG, max ~300 KB)
  primaryColor: '#0f766e',
  accentColor: '#25d366',
};

function merge(base, extra) {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return structuredClone(base);
  const out = structuredClone(base);
  for (const [key, value] of Object.entries(extra)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
      out[key] = merge(base[key], value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

export function companySettings(company) {
  return merge(COMPANY_DEFAULTS, company?.settings || {});
}

export function companyBranding(company) {
  const b = merge(BRANDING_DEFAULTS, company?.branding || {});
  if (!b.displayName) b.displayName = company?.name || '';
  return b;
}

// Everything the chat flow and notifications need about the current company.
export async function currentCompanyProfile(companyId = optionalTenantId()) {
  const company = companyId ? await Company.findById(companyId) : null;
  if (!company) return null;
  return describeCompany(company);
}

export function describeCompany(company) {
  return {
    id: company.id,
    name: company.name,
    status: company.status,
    plan: company.plan,
    planInfo: planOf(company),
    features: effectiveFeatures(company),
    limits: effectiveLimits(company),
    settings: companySettings(company),
    branding: companyBranding(company),
  };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Office hours for a weekday ('YYYY-MM-DD' date). null when closed.
export function hoursOn(settings, date) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  const key = WEEKDAYS[(day + 6) % 7];
  const h = settings?.hours?.[key];
  if (!h || h.closed) return null;
  return { open: TIME_RE.test(h.open) ? h.open : '08:00', close: TIME_RE.test(h.close) ? h.close : '17:00' };
}

export function hoursText(settings) {
  const labels = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  const groups = [];
  for (const key of WEEKDAYS) {
    const h = settings.hours[key];
    const text = h.closed ? 'Closed' : `${h.open} – ${h.close}`;
    const last = groups[groups.length - 1];
    if (last && last.text === text) last.to = key;
    else groups.push({ from: key, to: key, text });
  }
  return groups.map((g) => `${labels[g.from]}${g.from !== g.to ? `–${labels[g.to]}` : ''}: ${g.text}`).join('\n');
}

// Validates and normalises a settings patch from the company admin.
export function cleanSettingsPatch(patch = {}) {
  const out = {};
  const str = (v, max = 300) => String(v ?? '').trim().slice(0, max);
  for (const key of ['phone', 'email', 'address', 'location']) if (patch[key] !== undefined) out[key] = str(patch[key]);
  if (patch.timezone !== undefined) out.timezone = str(patch.timezone, 60) || 'Africa/Gaborone';
  if (patch.defaultLanguage !== undefined) out.defaultLanguage = patch.defaultLanguage === 'tn' ? 'tn' : 'en';
  if (patch.hours && typeof patch.hours === 'object') {
    out.hours = {};
    for (const key of WEEKDAYS) {
      const h = patch.hours[key];
      if (!h) continue;
      const open = TIME_RE.test(h.open) ? h.open : '08:00';
      const close = TIME_RE.test(h.close) ? h.close : '17:00';
      if (!h.closed && close <= open) {
        const err = new Error(`Closing time must be after opening time (${key}).`);
        err.status = 400;
        throw err;
      }
      out.hours[key] = { open, close, closed: Boolean(h.closed) };
    }
  }
  if (patch.rules && typeof patch.rules === 'object') {
    const r = patch.rules;
    out.rules = {};
    if (r.requireId !== undefined) out.rules.requireId = ['never', 'first_visit', 'every_visit'].includes(r.requireId) ? r.requireId : 'never';
    if (r.requireNda !== undefined) out.rules.requireNda = Boolean(r.requireNda);
    if (r.ndaText !== undefined) out.rules.ndaText = str(r.ndaText, 2000);
    if (r.healthScreening !== undefined) out.rules.healthScreening = Boolean(r.healthScreening);
    if (Array.isArray(r.healthQuestions)) out.rules.healthQuestions = r.healthQuestions.map((q) => str(q, 300)).filter(Boolean).slice(0, 6);
  }
  if (patch.departments?.handover && Array.isArray(patch.departments.handover)) {
    const list = patch.departments.handover.map((d) => str(d, 60)).filter(Boolean).slice(0, 9);
    if (list.length) out.departments = { handover: list };
  }
  if (patch.templates && typeof patch.templates === 'object') {
    out.templates = {};
    for (const key of ['welcome', 'approved', 'goodbye']) {
      const tpl = patch.templates[key];
      if (tpl) out.templates[key] = { en: str(tpl.en, 1000), tn: str(tpl.tn, 1000) };
    }
  }
  if (patch.integrations && typeof patch.integrations === 'object') {
    const i = patch.integrations;
    out.integrations = {};
    if (i.slackWebhook !== undefined) {
      const url = str(i.slackWebhook, 500);
      if (url && !/^https:\/\/hooks\.slack\.com\//.test(url)) {
        const err = new Error('The Slack webhook must start with https://hooks.slack.com/');
        err.status = 400;
        throw err;
      }
      out.integrations.slackWebhook = url;
    }
    if (i.slackEvents && typeof i.slackEvents === 'object') {
      out.integrations.slackEvents = {};
      for (const key of Object.keys(COMPANY_DEFAULTS.integrations.slackEvents)) {
        if (i.slackEvents[key] !== undefined) out.integrations.slackEvents[key] = Boolean(i.slackEvents[key]);
      }
    }
    if (i.wifi && typeof i.wifi === 'object') {
      out.integrations.wifi = { enabled: Boolean(i.wifi.enabled), ssid: str(i.wifi.ssid, 64), password: str(i.wifi.password, 64) };
    }
  }
  return out;
}

export function cleanBrandingPatch(patch = {}) {
  const out = {};
  const color = (v) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : null);
  if (patch.displayName !== undefined) out.displayName = String(patch.displayName || '').trim().slice(0, 80);
  if (patch.primaryColor !== undefined) out.primaryColor = color(patch.primaryColor) || BRANDING_DEFAULTS.primaryColor;
  if (patch.accentColor !== undefined) out.accentColor = color(patch.accentColor) || BRANDING_DEFAULTS.accentColor;
  if (patch.logo !== undefined) {
    const logo = String(patch.logo || '');
    if (logo && !/^data:image\/(png|jpeg|jpg|svg\+xml|webp);base64,[A-Za-z0-9+/=]+$/.test(logo)) {
      const err = new Error('The logo must be a PNG, JPEG, WEBP or SVG image.');
      err.status = 400;
      throw err;
    }
    if (logo.length > 420_000) {
      const err = new Error('The logo is too large (max 300 KB).');
      err.status = 400;
      throw err;
    }
    out.logo = logo;
  }
  return out;
}
