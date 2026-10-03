// Subscription tiers. A company's effective features and limits are its plan's, adjusted by the
// per-company overrides a super admin sets (to restrict or grant individual features).
// Limits: null = unlimited. Monthly limits reset on the 1st (organisation time zone).

export const FEATURES = {
  knowledge_base: 'Knowledge base (files, website, Q&A)',
  ai_answers: 'AI answers to visitor questions',
  appointments: 'Appointments (book, reschedule, calendar invites)',
  feedback: 'Visitor feedback and complaints',
  service_requests: 'Service requests and tickets',
  human_handover: 'Hand over to a human agent',
  visitation_rules: 'Visitation rules (ID upload, NDA, health screening)',
  reminders: 'Visit reminders 1 hour before',
  white_label: 'White-labelling (logo, colours, message templates)',
  slack: 'Slack notifications',
  guest_wifi: 'Guest Wi-Fi details in passes',
  reports_pdf: 'PDF reports',
};

export const LIMITS = {
  hosts: 'Hosts',
  staff: 'Staff logins',
  visits_per_month: 'Visit requests per month',
  messages_per_month: 'WhatsApp messages per month',
  knowledge_entries: 'Knowledge base entries',
  storage_mb: 'Storage (MB)',
};

export const PLANS = {
  starter: {
    name: 'Starter',
    price: 499,
    currency: 'BWP',
    features: ['knowledge_base', 'appointments', 'feedback', 'reminders'],
    limits: { hosts: 10, staff: 3, visits_per_month: 300, messages_per_month: 3000, knowledge_entries: 20, storage_mb: 50 },
  },
  business: {
    name: 'Business',
    price: 1499,
    currency: 'BWP',
    features: [
      'knowledge_base', 'ai_answers', 'appointments', 'feedback', 'service_requests', 'human_handover',
      'visitation_rules', 'reminders', 'slack', 'guest_wifi', 'reports_pdf',
    ],
    limits: { hosts: 100, staff: 15, visits_per_month: 3000, messages_per_month: 30000, knowledge_entries: 200, storage_mb: 500 },
  },
  enterprise: {
    name: 'Enterprise',
    price: 3999,
    currency: 'BWP',
    features: Object.keys(FEATURES),
    limits: { hosts: null, staff: null, visits_per_month: null, messages_per_month: null, knowledge_entries: null, storage_mb: null },
  },
};

export function planOf(company) {
  return PLANS[company?.plan] || PLANS.starter;
}

// { feature: true/false } after overrides. overrides = { features: { slack: false, ... }, limits: { hosts: 25 } }
export function effectiveFeatures(company) {
  const plan = planOf(company);
  const overrides = company?.feature_overrides?.features || {};
  const out = {};
  for (const key of Object.keys(FEATURES)) {
    out[key] = key in overrides ? Boolean(overrides[key]) : plan.features.includes(key);
  }
  return out;
}

export function effectiveLimits(company) {
  const plan = planOf(company);
  const overrides = company?.feature_overrides?.limits || {};
  const out = {};
  for (const key of Object.keys(LIMITS)) {
    const value = key in overrides ? overrides[key] : plan.limits[key];
    out[key] = value === null || value === '' || value === undefined ? null : Number(value);
  }
  return out;
}

export function hasFeature(company, feature) {
  return Boolean(effectiveFeatures(company)[feature]);
}
