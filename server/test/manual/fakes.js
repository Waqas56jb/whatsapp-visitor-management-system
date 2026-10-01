// In-memory stand-ins for the database models, host/visit services and the WhatsApp sender.
// Loaded in place of the real modules by hooks.js, so the transcript script never touches
// Postgres or WhatsApp.

export const HOST_DIRECTORY = [
  { id: 1, name: 'Kabo Majube', department: 'Technology Planning', phone: '26771000101', status: 'active' },
  { id: 2, name: 'Micha Ntsima', department: 'Technology Planning', phone: '26771000102', status: 'active' },
  { id: 3, name: 'Boikarabelo Ramaretlwa', department: 'Human Resources', phone: '26771000103', status: 'active' },
];

export const store = {
  states: new Map(), // phone -> collected_data
  visitors: [], // { id, name, company, phone }
  visits: [], // created visits
  sent: [], // { to, text, image? }
};

let refCounter = 1;
let visitorId = 1;

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

export const Visitor = {
  findByPhone: async (phone) => store.visitors.find((v) => v.phone === phone) || null,
};

export const Visit = {
  listOpenFrom: async (today) =>
    store.visits.filter((v) => ['pending', 'approved'].includes(v.status) && v.visit_date >= today),
  listByVisitorPhone: async (phone, limit = 5) =>
    store.visits.filter((v) => v.visitor_phone === phone).slice(-limit).reverse(),
  findByRef: async (ref) => store.visits.find((v) => v.ref_number === ref) || null,
};

export const ConversationLog = { listByPhone: async () => [], add: async () => null };
export const Knowledge = { listAll: async () => [] };
export const Host = {
  listActive: async () => HOST_DIRECTORY,
  findById: async (id) => HOST_DIRECTORY.find((h) => h.id === Number(id)) || null,
};
export const Audit = { add: async () => null };

// ---- services/hosts.js ----
export async function listActiveHosts() {
  return HOST_DIRECTORY.map((h) => ({ ...h }));
}

// ---- services/visits.js ----
// Mirrors the real service: the visitor record for this phone is created, or updated with the
// name and company confirmed in the booking.
export async function createPendingVisit({ name, company, hostId, purpose, date, time, visitType, visitorPhone }) {
  const host = HOST_DIRECTORY.find((h) => h.id === hostId);
  if (!host) throw new Error('Host not found');
  let visitor = store.visitors.find((v) => v.phone === visitorPhone);
  if (!visitor) {
    visitor = { id: visitorId++, name, company, phone: visitorPhone };
    store.visitors.push(visitor);
  } else {
    visitor.name = name;
    if (company && company !== '—') visitor.company = company;
  }
  const visit = {
    ref_number: `VMS-TEST-${String(refCounter++).padStart(6, '0')}`,
    visitor_name: visitor.name,
    visitor_company: visitor.company,
    host_id: hostId,
    host_name: host.name,
    host_department: host.department,
    purpose,
    visit_date: date,
    visit_time: time,
    visit_type: visitType === 'social' ? 'social' : 'official',
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

export async function sendTextToPhone(to, text) {
  store.sent.push({ to, text });
  return true;
}

export async function sendImage(to, image, caption) {
  store.sent.push({ to, text: caption, image: true });
  return true;
}
