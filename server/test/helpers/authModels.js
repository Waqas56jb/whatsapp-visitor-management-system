// The real models module with the login tables replaced by in-memory stores, for auth tests.
// Loaded in place of src/models/index.js by authHooks.js.
export * from '../../src/models/index.js';

export const store = { admins: [], accounts: [], audit: [] };

const byId = (rows, id) => rows.find((r) => r.id === Number(id)) || null;
const byUsername = (rows, username) => rows.find((r) => r.username.toLowerCase() === String(username).toLowerCase()) || null;
const copy = (row) => (row ? { ...row } : null);

function setPassword(rows) {
  return async (id, password_hash) => {
    const row = byId(rows, id);
    if (!row) return null;
    // Distinct, increasing stamps even within the same millisecond.
    row.password_changed_at = new Date(Math.max(Date.now(), (row.password_changed_at?.getTime() || 0) + 1));
    row.password_hash = password_hash;
    return copy(row);
  };
}

export const Admin = {
  findByUsername: async (username) => copy(byUsername(store.admins, username)),
  findById: async (id) => copy(byId(store.admins, id)),
  setPassword: setPassword(store.admins),
};

export const Account = {
  findByUsername: async (username) => copy(byUsername(store.accounts, username)),
  findById: async (id) => copy(byId(store.accounts, id)),
  setPassword: setPassword(store.accounts),
};

export const Host = {
  findByAccountId: async () => null,
  findByName: async () => null,
  findById: async () => null,
};

export const Audit = {
  add: async (row) => {
    store.audit.push(row);
    return row;
  },
};
