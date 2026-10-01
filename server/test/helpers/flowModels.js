// In-memory visits, hosts and audit log for the visit-flow tests. Everything not replaced here
// comes from the real models module (never queried: the tests point the database nowhere).
export * from '../../src/models/index.js';

export const db = { visits: [], hosts: [], audit: [] };

const copy = (row) => (row ? { ...row } : null);
const host = (id) => db.hosts.find((h) => h.id === Number(id)) || null;

// The real query joins visitor and host details onto each visit.
function joined(v) {
  if (!v) return null;
  const h = host(v.host_id) || {};
  return { ...v, host_name: h.name, host_phone: h.phone, host_department: h.department };
}

export const Visit = {
  findById: async (id) => joined(copy(db.visits.find((v) => v.id === Number(id)))),
  findByPin: async (pin) => joined(copy(db.visits.find((v) => v.pin === pin))),
  findByToken: async (token) => joined(copy(db.visits.find((v) => v.qr_token === token))),
  // Same rule as the real UPDATE … WHERE status = 'pending': only the first decision applies.
  decide: async (id, status, qr_token, pin) => {
    await Promise.resolve();
    const v = db.visits.find((x) => x.id === Number(id) && x.status === 'pending');
    if (!v) return null;
    Object.assign(v, { status, qr_token: qr_token ?? v.qr_token, pin: pin ?? v.pin, decided_at: new Date() });
    return copy(v);
  },
  // Same rule as the real UPDATE … WHERE status = 'approved' AND used_at IS NULL.
  markUsed: async (id) => {
    await Promise.resolve();
    const v = db.visits.find((x) => x.id === Number(id) && x.status === 'approved' && !x.used_at);
    if (!v) return null;
    Object.assign(v, { status: 'used', used_at: db.clock || new Date() });
    return copy(v);
  },
  setHostMessageId: async (id, messageId) => {
    const v = db.visits.find((x) => x.id === Number(id));
    if (v) v.host_message_id = messageId;
    return v ? { id: v.id } : null;
  },
};

export const Host = { findById: async (id) => copy(host(id)) };
export const Audit = {
  add: async (row) => {
    db.audit.push(row);
    return row;
  },
};
export const ConversationLog = { linkVisit: async () => [], add: async () => null };
export const ConversationState = { findByPhone: async () => null };
export const Settings = { get: async () => ({ org_name: 'Botho Innovations' }) };
