// In-memory stand-ins for the database models, host/visit services and the WhatsApp sender.
// Loaded in place of the real modules by hooks.js, so the transcript script never touches
// Postgres or WhatsApp.

export const HOST_DIRECTORY = [
  { id: 1, name: 'Kabo Majube', department: 'Technology Planning', phone: '', status: 'active' },
  { id: 2, name: 'Micha Ntsima', department: 'Technology Planning', phone: '', status: 'active' },
  { id: 3, name: 'Boikarabelo Ramaretlwa', department: 'Human Resources', phone: '', status: 'active' },
];

export const store = {
  states: new Map(), // phone -> collected_data
  visits: [], // created visits
  sent: [], // { to, text }
};

let refCounter = 1;

// ---- models/index.js ----
export const ConversationState = {
  findByPhone: async (phone) => (store.states.has(phone) ? { collected_data: store.states.get(phone) } : null),
  upsert: async (phone, step, data) => {
    store.states.set(phone, JSON.parse(JSON.stringify(data)));
    return { phone_number: phone, current_step: step };
  },
  clear: async (phone) => store.states.delete(phone),
};

export const Settings = { get: async () => ({ org_name: 'Botho Innovations' }) };

export const Visit = {
  listOpenFrom: async (today) =>
    store.visits.filter((v) => ['pending', 'approved'].includes(v.status) && v.visit_date >= today),
  listByVisitorPhone: async (phone, limit = 5) =>
    store.visits.filter((v) => v.visitor_phone === phone).slice(-limit).reverse(),
  findByRef: async (ref) => store.visits.find((v) => v.ref_number === ref) || null,
};

export const ConversationLog = { listByPhone: async () => [], add: async () => null };
export const Knowledge = { listAll: async () => [] };
export const Host = { listActive: async () => HOST_DIRECTORY };

// ---- services/hosts.js ----
export async function listActiveHosts() {
  return HOST_DIRECTORY.map((h) => ({ ...h }));
}

// ---- services/visits.js ----
export async function createPendingVisit({ name, company, hostId, purpose, date, time, visitorPhone }) {
  const host = HOST_DIRECTORY.find((h) => h.id === hostId);
  if (!host) throw new Error('Host not found');
  const visit = {
    ref_number: `VMS-TEST-${String(refCounter++).padStart(6, '0')}`,
    visitor_name: name,
    company,
    host_id: hostId,
    host_name: host.name,
    host_department: host.department,
    purpose,
    visit_date: date,
    visit_time: time,
    status: 'pending',
    visitor_phone: visitorPhone,
  };
  store.visits.push(visit);
  return visit;
}

export async function cancelVisitByVisitor() {
  return { ok: false };
}

export async function rescheduleVisitByVisitor() {
  return { ok: false };
}

// ---- whatsapp/sendMessage.js ----
export async function sendText(to, text) {
  store.sent.push({ to, text });
  return true;
}
