// In-memory stand-ins for the database models, the host list service and the WhatsApp sender.
// Loaded in place of the real modules by hooks.js, so the transcript script never touches
// Postgres or WhatsApp. The visit services (booking, decisions, gate) are the real ones.

export const HOST_DIRECTORY = [
  { id: 1, name: 'Kabo Majube', department: 'Technology Planning', phone: '26771000101', status: 'active' },
  { id: 2, name: 'Micha Ntsima', department: 'Technology Planning', phone: '26771000102', status: 'active' },
  { id: 3, name: 'Boikarabelo Ramaretlwa', department: 'Human Resources', phone: '26771000103', status: 'active' },
];

export const store = {
  states: new Map(), // phone -> collected_data
  visitors: [], // { id, name, company, phone }
  visits: [], // raw visit rows
  audit: [],
  sent: [], // { to, text, id?, image? } — every WhatsApp message the system sent
};

let visitId = 1;
let visitorId = 1;
let messageId = 1;
const digits = (v) => String(v || '').replace(/\D/g, '');
const copy = (row) => (row ? { ...row } : null);
const host = (id) => HOST_DIRECTORY.find((h) => h.id === Number(id)) || null;

// The real queries join visitor and host details onto each visit.
export function joinVisit(v) {
  if (!v) return null;
  const visitor = store.visitors.find((x) => x.id === v.visitor_id) || {};
  const h = host(v.host_id) || {};
  return {
    ...v,
    visitor_name: visitor.name,
    visitor_company: visitor.company,
    visitor_profile_phone: visitor.phone,
    host_name: h.name,
    host_department: h.department,
    host_phone: h.phone,
  };
}
const find = (pred) => joinVisit(copy(store.visits.find(pred)));

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
  findByPhone: async (phone) => copy(store.visitors.find((v) => digits(v.phone) === digits(phone))),
  create: async ({ name, company = '—', phone = null }) => {
    const row = { id: visitorId++, name, company, phone };
    store.visitors.push(row);
    return copy(row);
  },
  update: async (id, fields) => {
    const row = store.visitors.find((v) => v.id === id);
    Object.assign(row, Object.fromEntries(Object.entries(fields).filter(([, val]) => val !== undefined)));
    return copy(row);
  },
};

export const Visit = {
  create: async (row) => {
    const v = { id: visitId++, qr_token: null, pin: null, used_at: null, decided_at: null, host_message_id: null, created_at: new Date(), ...row };
    store.visits.push(v);
    return copy(v);
  },
  findById: async (id) => find((v) => v.id === Number(id)),
  findByRef: async (ref) => find((v) => v.ref_number.toLowerCase() === String(ref).toLowerCase()),
  findByToken: async (token) => find((v) => v.qr_token === token),
  findByPin: async (pin) => find((v) => v.pin === String(pin)),
  findByHostMessageId: async (id) => find((v) => v.host_message_id === id),
  listByVisitorPhone: async (phone, limit = 5) =>
    store.visits.filter((v) => digits(v.visitor_phone) === digits(phone)).slice(-limit).reverse().map(joinVisit),
  listOpenFrom: async (today) => store.visits.filter((v) => ['pending', 'approved'].includes(v.status) && v.visit_date >= today).map(copy),
  listPendingForHost: async (hostId, fromDate) =>
    store.visits
      .filter((v) => v.host_id === Number(hostId) && v.status === 'pending' && v.visit_date >= fromDate)
      .sort((a, b) => `${a.visit_date} ${a.visit_time}`.localeCompare(`${b.visit_date} ${b.visit_time}`))
      .map(joinVisit),
  // Same rule as the real UPDATE … WHERE status = 'pending'.
  decide: async (id, status, qr_token, pin) => {
    const v = store.visits.find((x) => x.id === Number(id) && x.status === 'pending');
    if (!v) return null;
    Object.assign(v, { status, qr_token: qr_token ?? v.qr_token, pin: pin ?? v.pin, decided_at: new Date() });
    return copy(v);
  },
  // Same rule as the real UPDATE … WHERE status = 'approved' AND used_at IS NULL.
  markUsed: async (id) => {
    const v = store.visits.find((x) => x.id === Number(id) && x.status === 'approved' && !x.used_at);
    if (!v) return null;
    Object.assign(v, { status: 'used', used_at: new Date() });
    return copy(v);
  },
  setHostMessageId: async (id, msgId) => {
    const v = store.visits.find((x) => x.id === Number(id));
    if (v) v.host_message_id = msgId;
    return v ? { id: v.id } : null;
  },
  setStatus: async (id, status) => {
    const v = store.visits.find((x) => x.id === Number(id));
    if (v) v.status = status;
    return copy(v);
  },
};

export const ConversationLog = { listByPhone: async () => [], add: async () => null, linkVisit: async () => [] };
export const Knowledge = { listAll: async () => [] };
export const Host = {
  listActive: async () => HOST_DIRECTORY,
  findById: async (id) => copy(host(id)),
  findByName: async (name) => copy(HOST_DIRECTORY.find((h) => h.name.toLowerCase() === String(name).toLowerCase())),
  findByPhone: async (phone) => copy(HOST_DIRECTORY.find((h) => digits(h.phone) === digits(phone))),
};
export const Audit = {
  add: async (row) => {
    store.audit.push(row);
    return row;
  },
};

// ---- services/hosts.js ----
export async function listActiveHosts() {
  return HOST_DIRECTORY.map((h) => ({ ...h }));
}

// ---- whatsapp/sendMessage.js ----
export async function sendText(to, text) {
  store.sent.push({ to: digits(to), text: String(text) });
  return true;
}

export async function sendImage(to, image, caption) {
  store.sent.push({ to: digits(to), text: String(caption || ''), image: true });
  return true;
}

export async function sendTextToPhoneDetailed(to, text) {
  const id = `WAMSG-${messageId++}`;
  store.sent.push({ to: digits(to), text: String(text), id });
  return { sent: true, id };
}

export async function sendTextToPhone(to, text) {
  return (await sendTextToPhoneDetailed(to, text)).sent;
}
