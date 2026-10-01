// The real models module with in-memory stand-ins for everything the API tests touch, so no
// request can reach a real database. Loaded in place of src/models/index.js by authHooks.js.
export * from '../../src/models/index.js';

export const store = { admins: [], audit: [], knowledge: [] };

const byId = (rows, id) => rows.find((r) => r.id === Number(id)) || null;
const copy = (row) => (row ? { ...row } : null);
let nextId = 1000;

export const Admin = {
  findByUsername: async (username) =>
    copy(store.admins.find((r) => r.username.toLowerCase() === String(username).toLowerCase())),
  findById: async (id) => copy(byId(store.admins, id)),
  list: async () => store.admins.map(copy),
  setPassword: async (id, password_hash) => {
    const row = byId(store.admins, id);
    if (!row) return null;
    // Distinct, increasing stamps even within the same millisecond.
    row.password_changed_at = new Date(Math.max(Date.now(), (row.password_changed_at?.getTime() || 0) + 1));
    row.password_hash = password_hash;
    return copy(row);
  },
  create: async ({ username, password_hash, name, role }) => {
    const row = { id: nextId++, username, password_hash, name, role, status: 'active', password_changed_at: null, created_at: new Date() };
    store.admins.push(row);
    return copy(row);
  },
  setStatus: async (id, status) => {
    const row = byId(store.admins, id);
    if (row) row.status = status;
    return copy(row);
  },
  setRole: async (id, role) => {
    const row = byId(store.admins, id);
    if (row) row.role = role;
    return copy(row);
  },
  remove: async (id) => {
    const i = store.admins.findIndex((r) => r.id === Number(id));
    return i >= 0 ? store.admins.splice(i, 1)[0] : null;
  },
  countActiveSuperAdmins: async () => store.admins.filter((r) => r.role === 'super_admin' && r.status === 'active').length,
};

export const Audit = {
  add: async (row) => {
    store.audit.push(row);
    return row;
  },
  list: async () => [],
};

export const Knowledge = {
  listAll: async () => store.knowledge.map(copy),
  findById: async (id) => copy(byId(store.knowledge, id)),
  create: async ({ kind, title = '', question = '', answer = '' }) => {
    const row = { id: nextId++, account_id: null, kind, title, question, answer, created_at: new Date() };
    store.knowledge.push(row);
    return copy(row);
  },
  update: async (id, fields) => {
    const row = byId(store.knowledge, id);
    if (row) Object.assign(row, Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)));
    return copy(row);
  },
  remove: async (id) => {
    const i = store.knowledge.findIndex((r) => r.id === Number(id));
    return i >= 0 ? store.knowledge.splice(i, 1)[0] : null;
  },
  upsertByKind: async (kind, fields) => {
    const existing = store.knowledge.find((r) => r.kind === kind);
    if (existing) return Knowledge.update(existing.id, fields);
    return Knowledge.create({ kind, ...fields });
  },
};

// Empty organisation data: every list is empty and nothing is found.
export const Visit = {
  list: async () => [],
  findById: async () => null,
  findByRef: async () => null,
  findByToken: async () => null,
  findByPin: async () => null,
};
export const Visitor = { listWithStats: async () => [] };
export const Host = {
  list: async () => [],
  listActive: async () => [],
  findById: async () => null,
  findByName: async () => null,
  setStatus: async () => null,
};
export const Settings = {
  get: async () => ({ org_name: 'Test Org', phone: '', email: '' }),
  upsert: async (fields) => ({ org_name: 'Test Org', phone: '', email: '', ...fields }),
};
export const ConversationLog = { listThreads: async () => [], listByPhone: async () => [] };
export const CompanyWhatsApp = { get: async () => null };
export const dashboardStats = async () => ({});
export const reportSummary = async () => ({});
export const visitsByDepartment = async () => [];
