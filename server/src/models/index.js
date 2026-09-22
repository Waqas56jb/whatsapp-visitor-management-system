import { query, queryOne } from '../config/db.js';
import { T } from '../config/tables.js';
import { normalizePhone } from '../utils/phone.js';

export const Admin = {
  findByUsername: (username) =>
    queryOne(`SELECT * FROM ${T.admins} WHERE username = $1`, [username]),
  create: (username, password_hash, name = 'Admin') =>
    queryOne(
      `INSERT INTO ${T.admins} (username, password_hash, name) VALUES ($1,$2,$3) RETURNING *`,
      [username, password_hash, name]
    ),
};

export const Account = {
  findByUsername: (username) =>
    queryOne(`SELECT * FROM ${T.accounts} WHERE username = $1`, [username]),
  findById: (id) => queryOne(`SELECT * FROM ${T.accounts} WHERE id = $1`, [id]),
  list: () => query(`SELECT * FROM ${T.accounts} ORDER BY created_at DESC`),
  create: ({ name, username, password_hash, role, status = 'active' }) =>
    queryOne(
      `INSERT INTO ${T.accounts} (name, username, password_hash, role, status)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, username, password_hash, role, status]
    ),
  toggle: (id) =>
    queryOne(
      `UPDATE ${T.accounts}
       SET status = CASE WHEN status = 'active' THEN 'disabled' ELSE 'active' END
       WHERE id = $1 RETURNING *`,
      [id]
    ),
  setStatus: (id, status) =>
    queryOne(`UPDATE ${T.accounts} SET status = $2 WHERE id = $1 RETURNING *`, [id, status]),
  remove: (id) => queryOne(`DELETE FROM ${T.accounts} WHERE id = $1 RETURNING *`, [id]),
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
  findByPhone: (phone) =>
    queryOne(
      `SELECT * FROM ${T.hosts} WHERE regexp_replace(phone, '[^0-9]', '', 'g') = $1`,
      [normalizePhone(phone)]
    ),
  findByAccountId: (accountId) =>
    queryOne(`SELECT * FROM ${T.hosts} WHERE account_id = $1`, [accountId]),
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
  decide: (id, status, qr_token) =>
    queryOne(
      `UPDATE ${T.visits}
       SET status = $2, qr_token = COALESCE($3, qr_token), decided_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, status, qr_token]
    ),
  markUsed: (id) =>
    queryOne(
      `UPDATE ${T.visits} SET used_at = NOW(), status = CASE WHEN status = 'approved' THEN 'used' ELSE status END
       WHERE id = $1 RETURNING *`,
      [id]
    ),
};

export const ConversationState = {
  findByPhone: (phone, accountId = 0) =>
    queryOne(
      `SELECT * FROM ${T.conversations} WHERE phone_number = $1 AND account_id = $2`,
      [normalizePhone(phone), Number(accountId) || 0]
    ),
  upsert: (phone, current_step, collected_data = {}, accountId = 0) =>
    queryOne(
      `INSERT INTO ${T.conversations} (phone_number, current_step, collected_data, account_id, updated_at)
       VALUES ($1,$2,$3::jsonb,$4, NOW())
       ON CONFLICT (phone_number, account_id) DO UPDATE
         SET current_step = EXCLUDED.current_step,
             collected_data = EXCLUDED.collected_data,
             updated_at = NOW()
       RETURNING *`,
      [normalizePhone(phone), current_step, JSON.stringify(collected_data || {}), Number(accountId) || 0]
    ),
  clear: (phone, accountId = 0) =>
    query(`DELETE FROM ${T.conversations} WHERE phone_number = $1 AND account_id = $2`, [
      normalizePhone(phone),
      Number(accountId) || 0,
    ]),
};

export const Knowledge = {
  list: (accountId) =>
    query(`SELECT * FROM ${T.knowledge} WHERE account_id = $1 ORDER BY kind ASC, id ASC`, [accountId]),
  findById: (id, accountId) =>
    queryOne(`SELECT * FROM ${T.knowledge} WHERE id = $1 AND account_id = $2`, [id, accountId]),
  create: ({ account_id, kind, title = '', question = '', answer = '' }) =>
    queryOne(
      `INSERT INTO ${T.knowledge} (account_id, kind, title, question, answer)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [account_id, kind || 'qa', title, question, answer]
    ),
  update: (id, accountId, fields) => {
    const allowed = ['kind', 'title', 'question', 'answer'];
    const sets = [];
    const vals = [];
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        vals.push(fields[key]);
        sets.push(`${key} = $${vals.length}`);
      }
    }
    if (!sets.length) return Knowledge.findById(id, accountId);
    vals.push(id, accountId);
    return queryOne(
      `UPDATE ${T.knowledge} SET ${sets.join(', ')} WHERE id = $${vals.length - 1} AND account_id = $${vals.length} RETURNING *`,
      vals
    );
  },
  remove: (id, accountId) =>
    queryOne(`DELETE FROM ${T.knowledge} WHERE id = $1 AND account_id = $2 RETURNING *`, [id, accountId]),
};

export const WhatsAppLink = {
  findByAccountId: (accountId) =>
    queryOne(`SELECT * FROM ${T.whatsappLinks} WHERE account_id = $1`, [accountId]),
  listLinked: () => query(`SELECT * FROM ${T.whatsappLinks} WHERE status IN ('connected', 'connecting')`),
  upsert: ({ account_id, host_id = null, phone = null, wa_name = null, status = 'disconnected' }) =>
    queryOne(
      `INSERT INTO ${T.whatsappLinks} (account_id, host_id, phone, wa_name, status, updated_at)
       VALUES ($1,$2,$3,$4,$5, NOW())
       ON CONFLICT (account_id) DO UPDATE
         SET host_id = COALESCE(EXCLUDED.host_id, ${T.whatsappLinks}.host_id),
             phone = COALESCE(EXCLUDED.phone, ${T.whatsappLinks}.phone),
             wa_name = COALESCE(EXCLUDED.wa_name, ${T.whatsappLinks}.wa_name),
             status = EXCLUDED.status,
             updated_at = NOW()
       RETURNING *`,
      [account_id, host_id, phone, wa_name, status]
    ),
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
  phoneBelongsToHost: async (phone, hostId) => {
    const row = await queryOne(
      `SELECT vs.id
       FROM ${T.visits} vs
       WHERE vs.host_id = $2
         AND (
           regexp_replace(COALESCE(vs.visitor_phone, ''), '[^0-9]', '', 'g') = $1
           OR vs.id IN (
             SELECT visit_id FROM ${T.conversationLog}
             WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') = $1
               AND visit_id IS NOT NULL
           )
         )
       LIMIT 1`,
      [normalizePhone(phone), hostId]
    );
    return Boolean(row);
  },
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
