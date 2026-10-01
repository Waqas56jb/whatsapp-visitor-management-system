import { query, queryOne } from '../config/db.js';
import { T } from '../config/tables.js';
import { normalizePhone } from '../utils/phone.js';

// Admin panel logins. role: super_admin | admin | reception; status: active | blocked.
export const Admin = {
  findByUsername: (username) =>
    queryOne(`SELECT * FROM ${T.admins} WHERE LOWER(username) = LOWER($1)`, [username]),
  findById: (id) => queryOne(`SELECT * FROM ${T.admins} WHERE id = $1`, [id]),
  list: () => query(`SELECT * FROM ${T.admins} ORDER BY created_at ASC`),
  // Sets a new password and stamps the change, which ends every session issued before it.
  setPassword: (id, password_hash) =>
    queryOne(
      `UPDATE ${T.admins} SET password_hash = $2, password_changed_at = NOW() WHERE id = $1 RETURNING *`,
      [id, password_hash]
    ),
  create: ({ username, password_hash, name, role }) =>
    queryOne(
      `INSERT INTO ${T.admins} (username, password_hash, name, role, status) VALUES ($1,$2,$3,$4,'active') RETURNING *`,
      [username, password_hash, name, role]
    ),
  setStatus: (id, status) =>
    queryOne(`UPDATE ${T.admins} SET status = $2 WHERE id = $1 RETURNING *`, [id, status]),
  setRole: (id, role) => queryOne(`UPDATE ${T.admins} SET role = $2 WHERE id = $1 RETURNING *`, [id, role]),
  remove: (id) => queryOne(`DELETE FROM ${T.admins} WHERE id = $1 RETURNING *`, [id]),
  countActiveSuperAdmins: async () =>
    Number(
      (await queryOne(`SELECT COUNT(*)::int AS n FROM ${T.admins} WHERE role = 'super_admin' AND status = 'active'`))?.n || 0
    ),
};

export const Host = {
  list: () => query(`SELECT * FROM ${T.hosts} ORDER BY created_at DESC`),
  listActive: () => query(`SELECT * FROM ${T.hosts} WHERE status = 'active' ORDER BY name ASC`),
  findById: (id) => queryOne(`SELECT * FROM ${T.hosts} WHERE id = $1`, [id]),
  findByName: (name) => queryOne(`SELECT * FROM ${T.hosts} WHERE LOWER(name) = LOWER($1)`, [name]),
  searchByName: (name) =>
    queryOne(
      `SELECT * FROM ${T.hosts}
       WHERE status = 'active' AND LOWER(name) LIKE LOWER($1)
       ORDER BY name ASC LIMIT 1`,
      [`%${name}%`]
    ),
  search: (term) =>
    query(
      `SELECT * FROM ${T.hosts}
       WHERE status = 'active'
         AND (
           LOWER(name) LIKE LOWER($1)
           OR LOWER(COALESCE(department, '')) LIKE LOWER($1)
         )
       ORDER BY name ASC
       LIMIT 8`,
      [`%${term}%`]
    ),
  searchByDepartment: (department) =>
    query(
      `SELECT * FROM ${T.hosts}
       WHERE status = 'active' AND LOWER(COALESCE(department, '')) LIKE LOWER($1)
       ORDER BY name ASC
       LIMIT 8`,
      [`%${department}%`]
    ),
  findByPhone: (phone) => {
    const digits = normalizePhone(phone);
    if (!digits || digits.length < 8) return null;
    return queryOne(
      `SELECT * FROM ${T.hosts} WHERE regexp_replace(phone, '[^0-9]', '', 'g') = $1`,
      [digits]
    );
  },
  create: ({ name, department, phone, status = 'active', account_id = null }) =>
    queryOne(
      `INSERT INTO ${T.hosts} (name, department, phone, status, account_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, department, phone, status, account_id]
    ),
  update: (id, fields) => {
    const allowed = ['name', 'department', 'phone', 'status', 'account_id'];
    const sets = [];
    const vals = [];
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        vals.push(fields[key]);
        sets.push(`${key} = $${vals.length}`);
      }
    }
    if (!sets.length) return Host.findById(id);
    vals.push(id);
    return queryOne(`UPDATE ${T.hosts} SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
  },
  setStatus: (id, status) =>
    queryOne(`UPDATE ${T.hosts} SET status = $2 WHERE id = $1 RETURNING *`, [id, status]),
  remove: (id) => queryOne(`DELETE FROM ${T.hosts} WHERE id = $1 RETURNING *`, [id]),
};

export const Visitor = {
  listWithStats: () =>
    query(`
      SELECT v.*,
        COUNT(vs.id)::int AS visit_count,
        MAX(vs.visit_date) AS last_visit
      FROM ${T.visitors} v
      LEFT JOIN ${T.visits} vs ON vs.visitor_id = v.id
      GROUP BY v.id
      ORDER BY v.created_at DESC
    `),
  findById: (id) => queryOne(`SELECT * FROM ${T.visitors} WHERE id = $1`, [id]),
  findByName: (name) => queryOne(`SELECT * FROM ${T.visitors} WHERE LOWER(name) = LOWER($1)`, [name]),
  findByPhone: (phone) =>
    queryOne(
      `SELECT * FROM ${T.visitors}
       WHERE regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = $1
       ORDER BY created_at DESC LIMIT 1`,
      [normalizePhone(phone)]
    ),
  create: ({ name, company = '—', status = 'active', phone = null }) =>
    queryOne(
      `INSERT INTO ${T.visitors} (name, company, status, phone) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, company, status, phone]
    ),
  update: (id, fields) => {
    const allowed = ['name', 'company', 'status', 'phone'];
    const sets = [];
    const vals = [];
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        vals.push(fields[key]);
        sets.push(`${key} = $${vals.length}`);
      }
    }
    if (!sets.length) return Visitor.findById(id);
    vals.push(id);
    return queryOne(`UPDATE ${T.visitors} SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
  },
};

const VISIT_SELECT = `
  SELECT vs.*, vis.name AS visitor_name, vis.company AS visitor_company, vis.phone AS visitor_profile_phone,
         h.name AS host_name, h.department AS host_department, h.phone AS host_phone, h.account_id AS host_account_id
  FROM ${T.visits} vs
  JOIN ${T.visitors} vis ON vis.id = vs.visitor_id
  JOIN ${T.hosts} h ON h.id = vs.host_id
`;

export const Visit = {
  list: ({ status, limit, hostId } = {}) => {
    const where = [];
    const vals = [];
    if (status && status !== 'all') {
      vals.push(status);
      where.push(`vs.status = $${vals.length}`);
    }
    if (hostId) {
      vals.push(hostId);
      where.push(`vs.host_id = $${vals.length}`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const lim = limit ? `LIMIT ${Number(limit)}` : '';
    return query(`${VISIT_SELECT} ${clause} ORDER BY vs.created_at DESC ${lim}`, vals);
  },
  findById: (id) => queryOne(`${VISIT_SELECT} WHERE vs.id = $1`, [id]),
  findByRef: (ref) =>
    queryOne(`${VISIT_SELECT} WHERE LOWER(vs.ref_number) = LOWER($1)`, [String(ref || '').trim()]),
  findByToken: (token) => queryOne(`${VISIT_SELECT} WHERE vs.qr_token = $1`, [token]),
  findByPin: (pin) =>
    queryOne(`${VISIT_SELECT} WHERE vs.pin = $1 ORDER BY vs.created_at DESC LIMIT 1`, [String(pin || '').trim()]),
  listByVisitorPhone: (phone, limit = 5) =>
    query(
      `${VISIT_SELECT}
       WHERE regexp_replace(COALESCE(vs.visitor_phone, vis.phone, ''), '[^0-9]', '', 'g') = $1
       ORDER BY vs.created_at DESC
       LIMIT ${Number(limit) || 5}`,
      [normalizePhone(phone)]
    ),
  create: (row) =>
    queryOne(
      `INSERT INTO ${T.visits}
        (ref_number, visitor_id, host_id, purpose, visit_date, visit_time, status, qr_token, visit_type, visitor_phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        row.ref_number,
        row.visitor_id,
        row.host_id,
        row.purpose,
        row.visit_date,
        row.visit_time,
        row.status || 'pending',
        row.qr_token || null,
        row.visit_type === 'social' ? 'social' : 'official',
        row.visitor_phone || null,
      ]
    ),
  // Only a pending visit can be decided. When a host (WhatsApp) and an admin (panel) decide at
  // the same moment, the first UPDATE wins and the second gets null.
  decide: (id, status, qr_token, pin) =>
    queryOne(
      `UPDATE ${T.visits}
       SET status = $2,
           qr_token = COALESCE($3, qr_token),
           pin = COALESCE($4, pin),
           decided_at = NOW()
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [id, status, qr_token, pin]
    ),
  setHostMessageId: (id, messageId) =>
    queryOne(`UPDATE ${T.visits} SET host_message_id = $2 WHERE id = $1 RETURNING id`, [id, messageId]),
  findByHostMessageId: (messageId) => queryOne(`${VISIT_SELECT} WHERE vs.host_message_id = $1`, [messageId]),
  // A host's requests still waiting for a decision, from today on, soonest first.
  listPendingForHost: (hostId, fromDate) =>
    query(
      `${VISIT_SELECT}
       WHERE vs.host_id = $1 AND vs.status = 'pending' AND vs.visit_date >= $2
       ORDER BY vs.visit_date ASC, vs.visit_time ASC, vs.id ASC`,
      [hostId, fromDate]
    ),
  setStatus: (id, status) => queryOne(`UPDATE ${T.visits} SET status = $2 WHERE id = $1 RETURNING *`, [id, status]),
  // New date/time goes back to the host for approval; the old QR/PIN stop working.
  reschedule: (id, date, time) =>
    queryOne(
      `UPDATE ${T.visits}
       SET visit_date = $2, visit_time = $3, status = 'pending', qr_token = NULL, pin = NULL, decided_at = NULL
       WHERE id = $1 RETURNING *`,
      [id, date, time]
    ),
  // Visits that hold a host's time slot (pending or approved) from a date onwards.
  listOpenFrom: (date) =>
    query(
      `SELECT ref_number, host_id, visit_date, visit_time, status FROM ${T.visits}
       WHERE status IN ('pending', 'approved') AND visit_date >= $1`,
      [date]
    ),
  // Checks a visitor in once: a second scan at the same moment gets null.
  markUsed: (id) =>
    queryOne(
      `UPDATE ${T.visits} SET used_at = NOW(), status = 'used'
       WHERE id = $1 AND status = 'approved' AND used_at IS NULL RETURNING *`,
      [id]
    ),
};

function hydrateConversation(row) {
  if (!row) return null;
  let data = row.collected_data;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      data = {};
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
  return { ...row, collected_data: data };
}

// One conversation per visitor phone number (there is a single company WhatsApp).
// The table enforces UNIQUE (phone_number), so the key must be the phone alone.
function conversationKey(phone) {
  return normalizePhone(phone) || String(phone || '').trim();
}

export const ConversationState = {
  findByPhone: async (phone) => {
    const key = conversationKey(phone);
    if (!key) return null;
    return hydrateConversation(await queryOne(`SELECT * FROM ${T.conversations} WHERE phone_number = $1`, [key]));
  },
  upsert: async (phone, current_step, collected_data = {}, accountId = 0) => {
    const row = await queryOne(
      `INSERT INTO ${T.conversations} (phone_number, current_step, collected_data, account_id, updated_at)
       VALUES ($1,$2,$3::jsonb,$4, NOW())
       ON CONFLICT (phone_number) DO UPDATE
         SET current_step = EXCLUDED.current_step,
             collected_data = EXCLUDED.collected_data,
             account_id = EXCLUDED.account_id,
             updated_at = NOW()
       RETURNING *`,
      [conversationKey(phone), current_step, JSON.stringify(collected_data || {}), Number(accountId) || 0]
    );
    return hydrateConversation(row);
  },
  clear: (phone) => query(`DELETE FROM ${T.conversations} WHERE phone_number = $1`, [conversationKey(phone)]),
};

// Organisation-wide knowledge for the WhatsApp assistant. account_id is legacy and always NULL
// for new rows (see migration 011); nothing here filters or deletes by account.
export const Knowledge = {
  listAll: () => query(`SELECT * FROM ${T.knowledge} ORDER BY kind ASC, id ASC`),
  findById: (id) => queryOne(`SELECT * FROM ${T.knowledge} WHERE id = $1`, [id]),
  create: ({ kind, title = '', question = '', answer = '' }) =>
    queryOne(
      `INSERT INTO ${T.knowledge} (account_id, kind, title, question, answer)
       VALUES (NULL,$1,$2,$3,$4) RETURNING *`,
      [kind || 'qa', title, question, answer]
    ),
  update: (id, fields) => {
    const allowed = ['kind', 'title', 'question', 'answer'];
    const sets = [];
    const vals = [];
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        vals.push(fields[key]);
        sets.push(`${key} = $${vals.length}`);
      }
    }
    if (!sets.length) return Knowledge.findById(id);
    vals.push(id);
    return queryOne(`UPDATE ${T.knowledge} SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
  },
  remove: (id) => queryOne(`DELETE FROM ${T.knowledge} WHERE id = $1 RETURNING *`, [id]),
  // One row per kind (greeting / instruction) for the whole organisation: the oldest is kept.
  upsertByKind: async (kind, { title = '', question = '', answer = '' }) => {
    const existing = await queryOne(`SELECT * FROM ${T.knowledge} WHERE kind = $1 ORDER BY id ASC LIMIT 1`, [kind]);
    if (existing) return Knowledge.update(existing.id, { title, question, answer });
    return Knowledge.create({ kind, title, question, answer });
  },
};

export const ConversationLog = {
  add: ({ phone_number, visit_id = null, direction, message_text, account_id = null }) =>
    queryOne(
      `INSERT INTO ${T.conversationLog} (phone_number, visit_id, direction, message_text, account_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [normalizePhone(phone_number), visit_id || null, direction, String(message_text || ''), account_id || null]
    ),
  linkVisit: (phone, visitId, windowHours = 24) =>
    query(
      `UPDATE ${T.conversationLog}
       SET visit_id = $2
       WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') = $1
         AND (visit_id IS NULL OR visit_id = $2)
         AND created_at >= NOW() - ($3::text || ' hours')::interval`,
      [normalizePhone(phone), visitId, String(windowHours)]
    ),
  listByPhone: (phone) =>
    query(
      `SELECT id, phone_number, visit_id, direction, message_text, created_at
       FROM ${T.conversationLog}
       WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') = $1
       ORDER BY created_at ASC, id ASC`,
      [normalizePhone(phone)]
    ),
  listThreads: (hostId) => {
    const hostFilter = hostId
      ? `WHERE regexp_replace(cl.phone_number, '[^0-9]', '', 'g') IN (
           SELECT regexp_replace(COALESCE(visitor_phone, ''), '[^0-9]', '', 'g')
           FROM ${T.visits} WHERE host_id = $1
         )
         OR cl.visit_id IN (SELECT id FROM ${T.visits} WHERE host_id = $1)`
      : '';
    const params = hostId ? [hostId] : [];
    return query(
      `SELECT
         cl.phone_number AS phone,
         COUNT(*)::int AS message_count,
         MAX(cl.created_at) AS last_at,
         (
           SELECT c2.message_text FROM ${T.conversationLog} c2
           WHERE regexp_replace(c2.phone_number, '[^0-9]', '', 'g')
             = regexp_replace(cl.phone_number, '[^0-9]', '', 'g')
           ORDER BY c2.created_at DESC, c2.id DESC LIMIT 1
         ) AS last_message,
         COALESCE(
           (
             SELECT vis.name FROM ${T.visits} vs
             JOIN ${T.visitors} vis ON vis.id = vs.visitor_id
             WHERE regexp_replace(COALESCE(vs.visitor_phone, vis.phone, ''), '[^0-9]', '', 'g')
               = regexp_replace(cl.phone_number, '[^0-9]', '', 'g')
             ${hostId ? 'AND vs.host_id = $1' : ''}
             ORDER BY vs.created_at DESC LIMIT 1
           ),
           (
             SELECT vis.name FROM ${T.visitors} vis
             WHERE regexp_replace(COALESCE(vis.phone, ''), '[^0-9]', '', 'g')
               = regexp_replace(cl.phone_number, '[^0-9]', '', 'g')
             ORDER BY vis.created_at DESC LIMIT 1
           )
         ) AS visitor_name
       FROM ${T.conversationLog} cl
       ${hostFilter}
       GROUP BY cl.phone_number
       ORDER BY last_at DESC`,
      params
    );
  },
};

export const Audit = {
  list: (limit) =>
    query(
      `SELECT * FROM ${T.audit} ORDER BY created_at DESC ${limit ? `LIMIT ${Number(limit)}` : 'LIMIT 200'}`
    ),
  add: ({ actor, action, details }) =>
    queryOne(
      `INSERT INTO ${T.audit} (actor, action, details) VALUES ($1,$2,$3) RETURNING *`,
      [actor, action, details || '']
    ),
};

export const CompanyWhatsApp = {
  ensure: async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS ${T.companyWhatsApp} (
        id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        status TEXT NOT NULL DEFAULT 'disconnected',
        phone TEXT,
        wa_name TEXT,
        creds JSONB,
        keys JSONB,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`INSERT INTO ${T.companyWhatsApp} (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  },
  get: async () => {
    await CompanyWhatsApp.ensure();
    return queryOne(`SELECT * FROM ${T.companyWhatsApp} WHERE id = 1`);
  },
  saveAuth: async ({ creds = null, keys = null }) => {
    await CompanyWhatsApp.ensure();
    return queryOne(
      `UPDATE ${T.companyWhatsApp}
       SET creds = COALESCE($1::jsonb, creds),
           keys = COALESCE($2::jsonb, keys),
           updated_at = NOW()
       WHERE id = 1
       RETURNING *`,
      [creds == null ? null : JSON.stringify(creds), keys == null ? null : JSON.stringify(keys)]
    );
  },
  saveLink: async ({ status, phone = undefined, wa_name = undefined }) => {
    await CompanyWhatsApp.ensure();
    return queryOne(
      `UPDATE ${T.companyWhatsApp}
       SET status = $1,
           phone = COALESCE($2, phone),
           wa_name = COALESCE($3, wa_name),
           updated_at = NOW()
       WHERE id = 1
       RETURNING *`,
      [status, phone ?? null, wa_name ?? null]
    );
  },
  clear: async () => {
    await CompanyWhatsApp.ensure();
    return queryOne(
      `UPDATE ${T.companyWhatsApp}
       SET status = 'disconnected', phone = NULL, wa_name = NULL, creds = NULL, keys = NULL, updated_at = NOW()
       WHERE id = 1
       RETURNING *`
    );
  },
};

export const Settings = {
  get: () => queryOne(`SELECT * FROM ${T.settings} WHERE id = 1`),
  upsert: ({ org_name, phone, email }) =>
    queryOne(
      `INSERT INTO ${T.settings} (id, org_name, phone, email)
       VALUES (1,$1,$2,$3)
       ON CONFLICT (id) DO UPDATE SET org_name = EXCLUDED.org_name, phone = EXCLUDED.phone, email = EXCLUDED.email, updated_at = NOW()
       RETURNING *`,
      [org_name, phone, email]
    ),
};

export async function dashboardStats() {
  const [visits, pending, approved, hosts] = await Promise.all([
    queryOne(`SELECT COUNT(*)::int AS n FROM ${T.visits}`),
    queryOne(`SELECT COUNT(*)::int AS n FROM ${T.visits} WHERE status = 'pending'`),
    queryOne(`SELECT COUNT(*)::int AS n FROM ${T.visits} WHERE status = 'approved'`),
    queryOne(`SELECT COUNT(*)::int AS n FROM ${T.hosts} WHERE status = 'active'`),
  ]);
  return {
    visitorsToday: visits?.n || 0,
    pending: pending?.n || 0,
    onsite: approved?.n || 0,
    activeHosts: hosts?.n || 0,
  };
}

export async function reportSummary() {
  const [total, approved, rejected] = await Promise.all([
    queryOne(`SELECT COUNT(*)::int AS n FROM ${T.visits}`),
    queryOne(`SELECT COUNT(*)::int AS n FROM ${T.visits} WHERE status = 'approved'`),
    queryOne(`SELECT COUNT(*)::int AS n FROM ${T.visits} WHERE status = 'rejected'`),
  ]);
  return {
    total: total?.n || 0,
    approved: approved?.n || 0,
    rejected: rejected?.n || 0,
    avg: '96%',
  };
}

export async function visitsByDepartment() {
  return query(`
    SELECT h.department AS dept, COUNT(vs.id)::int AS count
    FROM ${T.visits} vs
    JOIN ${T.hosts} h ON h.id = vs.host_id
    GROUP BY h.department
    ORDER BY count DESC
  `);
}
