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
         h.name AS host_name, h.department AS host_department, h.phone AS host_phone
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
  findByToken: (token) => queryOne(`${VISIT_SELECT} WHERE vs.qr_token = $1`, [token]),
  findByPin: (pin) =>
    queryOne(`${VISIT_SELECT} WHERE vs.pin = $1 ORDER BY vs.created_at DESC LIMIT 1`, [pin]),
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
        (ref_number, visitor_id, host_id, purpose, visit_date, visit_time, status, pin, qr_token, visit_type, visitor_phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        row.ref_number,
        row.visitor_id,
        row.host_id,
        row.purpose,
        row.visit_date,
        row.visit_time,
        row.status || 'pending',
        row.pin || null,
        row.qr_token || null,
        row.visit_type === 'social' ? 'social' : 'official',
        row.visitor_phone || null,
      ]
    ),
  decide: (id, status, pin, qr_token) =>
    queryOne(
      `UPDATE ${T.visits}
       SET status = $2, pin = COALESCE($3, pin), qr_token = COALESCE($4, qr_token), decided_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, status, pin, qr_token]
    ),
  markUsed: (id) =>
    queryOne(
      `UPDATE ${T.visits} SET used_at = NOW(), status = CASE WHEN status = 'approved' THEN 'used' ELSE status END
       WHERE id = $1 RETURNING *`,
      [id]
    ),
};

export const ConversationState = {
  findByPhone: (phone) =>
    queryOne(`SELECT * FROM ${T.conversations} WHERE phone_number = $1`, [normalizePhone(phone)]),
  upsert: (phone, current_step, collected_data = {}) =>
    queryOne(
      `INSERT INTO ${T.conversations} (phone_number, current_step, collected_data, updated_at)
       VALUES ($1,$2,$3::jsonb, NOW())
       ON CONFLICT (phone_number) DO UPDATE
         SET current_step = EXCLUDED.current_step,
             collected_data = EXCLUDED.collected_data,
             updated_at = NOW()
       RETURNING *`,
      [normalizePhone(phone), current_step, JSON.stringify(collected_data || {})]
    ),
  clear: (phone) => query(`DELETE FROM ${T.conversations} WHERE phone_number = $1`, [normalizePhone(phone)]),
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
