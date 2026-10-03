// Data access. Company data (hosts, visitors, visits, conversations, knowledge, feedback,
// service requests, handovers, documents, company audit) is always filtered by the current
// company from tenant.js — there is no unscoped query for it. Platform data (companies,
// platform users, settings, announcements, usage) is accessed explicitly.
import { query, queryOne } from '../config/db.js';
import { T } from '../config/tables.js';
import { optionalTenantId, tenantId } from '../tenant.js';
import { normalizePhone } from '../utils/phone.js';

const cid = () => tenantId();

function updateSet(fields, allowed, startAt = 1) {
  const sets = [];
  const vals = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      vals.push(fields[key]);
      sets.push(`${key} = $${vals.length + startAt - 1}`);
    }
  }
  return { sets, vals };
}

// ===================================================================== Platform

export const Company = {
  list: () =>
    query(`
      SELECT c.*,
        (SELECT COUNT(*)::int FROM ${T.hosts} h WHERE h.company_id = c.id) AS host_count,
        (SELECT COUNT(*)::int FROM ${T.admins} a WHERE a.company_id = c.id) AS staff_count,
        (SELECT COUNT(*)::int FROM ${T.visits} v WHERE v.company_id = c.id) AS visit_count,
        (SELECT status FROM ${T.companyWhatsApp} w WHERE w.company_id = c.id) AS whatsapp_status,
        (SELECT phone FROM ${T.companyWhatsApp} w WHERE w.company_id = c.id) AS whatsapp_phone
      FROM ${T.companies} c
      ORDER BY c.created_at ASC`),
  findById: (id) => queryOne(`SELECT * FROM ${T.companies} WHERE id = $1`, [id]),
  findByName: (name) => queryOne(`SELECT * FROM ${T.companies} WHERE LOWER(name) = LOWER($1)`, [name]),
  create: ({ name, registration_number = '', domain = '', plan = 'starter', settings = {} }) =>
    queryOne(
      `INSERT INTO ${T.companies} (name, registration_number, domain, plan, settings)
       VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING *`,
      [name, registration_number, domain, plan, JSON.stringify(settings)]
    ),
  updateProfile: (id, fields) => {
    const { sets, vals } = updateSet(fields, ['name', 'registration_number', 'domain'], 2);
    if (!sets.length) return Company.findById(id);
    return queryOne(`UPDATE ${T.companies} SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, [id, ...vals]);
  },
  setPlan: (id, plan) => queryOne(`UPDATE ${T.companies} SET plan = $2 WHERE id = $1 RETURNING *`, [id, plan]),
  setOverrides: (id, overrides) =>
    queryOne(`UPDATE ${T.companies} SET feature_overrides = $2::jsonb WHERE id = $1 RETURNING *`, [id, JSON.stringify(overrides)]),
  setStatus: (id, status, reason = '') =>
    queryOne(
      `UPDATE ${T.companies} SET status = $2, status_reason = $3, status_changed_at = NOW() WHERE id = $1 RETURNING *`,
      [id, status, reason]
    ),
  // Merges into the JSON settings / branding of a company (top-level keys replaced).
  mergeSettings: (id, patch) =>
    queryOne(`UPDATE ${T.companies} SET settings = settings || $2::jsonb WHERE id = $1 RETURNING *`, [id, JSON.stringify(patch)]),
  mergeBranding: (id, patch) =>
    queryOne(`UPDATE ${T.companies} SET branding = branding || $2::jsonb WHERE id = $1 RETURNING *`, [id, JSON.stringify(patch)]),
  remove: (id) => queryOne(`DELETE FROM ${T.companies} WHERE id = $1 RETURNING *`, [id]),
};

export const PlatformSettings = {
  get: async () => (await queryOne(`SELECT data FROM ${T.platformSettings} WHERE id = 1`))?.data || {},
  merge: async (patch) =>
    (
      await queryOne(
        `INSERT INTO ${T.platformSettings} (id, data) VALUES (1, $1::jsonb)
         ON CONFLICT (id) DO UPDATE SET data = ${T.platformSettings}.data || EXCLUDED.data, updated_at = NOW()
         RETURNING data`,
        [JSON.stringify(patch)]
      )
    )?.data || {},
};

export const Announcement = {
  list: () => query(`SELECT * FROM ${T.announcements} ORDER BY created_at DESC LIMIT 100`),
  active: () =>
    query(
      `SELECT * FROM ${T.announcements}
       WHERE starts_at <= NOW() AND (ends_at IS NULL OR ends_at > NOW())
       ORDER BY created_at DESC`
    ),
  create: ({ title, body, severity, starts_at, ends_at, created_by }) =>
    queryOne(
      `INSERT INTO ${T.announcements} (title, body, severity, starts_at, ends_at, created_by)
       VALUES ($1,$2,$3,COALESCE($4::timestamptz, NOW()),$5::timestamptz,$6) RETURNING *`,
      [title, body, severity, starts_at || null, ends_at || null, created_by]
    ),
  end: (id) => queryOne(`UPDATE ${T.announcements} SET ends_at = NOW() WHERE id = $1 RETURNING *`, [id]),
  setEmailed: (id, count) => queryOne(`UPDATE ${T.announcements} SET emailed_count = $2 WHERE id = $1 RETURNING *`, [id, count]),
};

export const Usage = {
  add: (companyId, metric, value = 1, day) =>
    query(
      `INSERT INTO ${T.usage} (company_id, day, metric, value) VALUES ($1, COALESCE($4::date, CURRENT_DATE), $2, $3)
       ON CONFLICT (company_id, day, metric) DO UPDATE SET value = ${T.usage}.value + EXCLUDED.value`,
      [companyId, metric, value, day || null]
    ),
  sinceByCompany: (fromDate) =>
    query(`SELECT company_id, metric, SUM(value)::bigint AS value FROM ${T.usage} WHERE day >= $1 GROUP BY company_id, metric`, [fromDate]),
  dailyTotals: (fromDate) =>
    query(`SELECT day, metric, SUM(value)::bigint AS value FROM ${T.usage} WHERE day >= $1 GROUP BY day, metric ORDER BY day`, [fromDate]),
};

// Panel logins. Platform users have company_id NULL; company users belong to one company.
export const Admin = {
  findByUsername: (username) => queryOne(`SELECT * FROM ${T.admins} WHERE LOWER(username) = LOWER($1)`, [username]),
  findById: (id) => queryOne(`SELECT * FROM ${T.admins} WHERE id = $1`, [id]),
  listPlatform: () => query(`SELECT * FROM ${T.admins} WHERE company_id IS NULL ORDER BY created_at ASC`),
  listCompany: (companyId) => query(`SELECT * FROM ${T.admins} WHERE company_id = $1 ORDER BY created_at ASC`, [companyId]),
  countCompany: async (companyId) =>
    Number((await queryOne(`SELECT COUNT(*)::int AS n FROM ${T.admins} WHERE company_id = $1`, [companyId]))?.n || 0),
  countAll: async () => Number((await queryOne(`SELECT COUNT(*)::int AS n FROM ${T.admins}`))?.n || 0),
  companyAdminEmails: (companyIds) =>
    query(
      `SELECT company_id, email, name FROM ${T.admins}
       WHERE role = 'company_admin' AND status = 'active' AND email <> '' AND company_id = ANY($1::int[])`,
      [companyIds]
    ),
  setPassword: (id, password_hash) =>
    queryOne(`UPDATE ${T.admins} SET password_hash = $2, password_changed_at = NOW() WHERE id = $1 RETURNING *`, [id, password_hash]),
  create: ({ username, password_hash, name, role, company_id = null, email = '' }) =>
    queryOne(
      `INSERT INTO ${T.admins} (username, password_hash, name, role, status, company_id, email)
       VALUES ($1,$2,$3,$4,'active',$5,$6) RETURNING *`,
      [username, password_hash, name, role, company_id, email]
    ),
  update: (id, fields) => {
    const { sets, vals } = updateSet(fields, ['name', 'email'], 2);
    if (!sets.length) return Admin.findById(id);
    return queryOne(`UPDATE ${T.admins} SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, [id, ...vals]);
  },
  setStatus: (id, status) => queryOne(`UPDATE ${T.admins} SET status = $2 WHERE id = $1 RETURNING *`, [id, status]),
  setRole: (id, role) => queryOne(`UPDATE ${T.admins} SET role = $2 WHERE id = $1 RETURNING *`, [id, role]),
  remove: (id) => queryOne(`DELETE FROM ${T.admins} WHERE id = $1 RETURNING *`, [id]),
  countActiveSuperAdmins: async () =>
    Number((await queryOne(`SELECT COUNT(*)::int AS n FROM ${T.admins} WHERE role = 'super_admin' AND status = 'active'`))?.n || 0),
  countActiveCompanyAdmins: async (companyId) =>
    Number(
      (await queryOne(`SELECT COUNT(*)::int AS n FROM ${T.admins} WHERE company_id = $1 AND role = 'company_admin' AND status = 'active'`, [companyId]))?.n || 0
    ),
};

// One linked WhatsApp number per company. Used by the connection manager, which handles several
// companies at once, so the company is always passed explicitly.
export const CompanyWhatsApp = {
  get: (companyId) => queryOne(`SELECT * FROM ${T.companyWhatsApp} WHERE company_id = $1`, [companyId]),
  listWithCredentials: () =>
    query(`SELECT company_id, status, phone FROM ${T.companyWhatsApp} WHERE keys ? 'creds.json'`),
  ensure: (companyId) =>
    query(`INSERT INTO ${T.companyWhatsApp} (company_id) VALUES ($1) ON CONFLICT (company_id) DO NOTHING`, [companyId]),
  saveAuth: async (companyId, { creds = null, keys = null }) => {
    await CompanyWhatsApp.ensure(companyId);
    return queryOne(
      `UPDATE ${T.companyWhatsApp}
       SET creds = COALESCE($2::jsonb, creds), keys = COALESCE($3::jsonb, keys), updated_at = NOW()
       WHERE company_id = $1 RETURNING company_id`,
      [companyId, creds == null ? null : JSON.stringify(creds), keys == null ? null : JSON.stringify(keys)]
    );
  },
  saveLink: async (companyId, { status, phone = undefined, wa_name = undefined }) => {
    await CompanyWhatsApp.ensure(companyId);
    return queryOne(
      `UPDATE ${T.companyWhatsApp}
       SET status = $2, phone = COALESCE($3, phone), wa_name = COALESCE($4, wa_name), updated_at = NOW()
       WHERE company_id = $1 RETURNING company_id`,
      [companyId, status, phone ?? null, wa_name ?? null]
    );
  },
  clear: (companyId) =>
    queryOne(
      `UPDATE ${T.companyWhatsApp}
       SET status = 'disconnected', phone = NULL, wa_name = NULL, creds = NULL, keys = NULL, updated_at = NOW()
       WHERE company_id = $1 RETURNING company_id`,
      [companyId]
    ),
};

// ===================================================================== Company (tenant-scoped)

export const Host = {
  list: () => query(`SELECT * FROM ${T.hosts} WHERE company_id = $1 ORDER BY created_at DESC`, [cid()]),
  listActive: () => query(`SELECT * FROM ${T.hosts} WHERE company_id = $1 AND status = 'active' ORDER BY name ASC`, [cid()]),
  count: async () => Number((await queryOne(`SELECT COUNT(*)::int AS n FROM ${T.hosts} WHERE company_id = $1`, [cid()]))?.n || 0),
  findById: (id) => queryOne(`SELECT * FROM ${T.hosts} WHERE company_id = $1 AND id = $2`, [cid(), id]),
  findByName: (name) => queryOne(`SELECT * FROM ${T.hosts} WHERE company_id = $1 AND LOWER(name) = LOWER($2)`, [cid(), name]),
  findByPhone: (phone) => {
    const digits = normalizePhone(phone);
    if (!digits || digits.length < 8) return null;
    return queryOne(`SELECT * FROM ${T.hosts} WHERE company_id = $1 AND regexp_replace(phone, '[^0-9]', '', 'g') = $2`, [cid(), digits]);
  },
  create: ({ name, department, phone, status = 'active', office = '', email = '' }) =>
    queryOne(
      `INSERT INTO ${T.hosts} (company_id, name, department, phone, status, office, email) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [cid(), name, department, phone, status, office, email]
    ),
  update: (id, fields) => {
    const { sets, vals } = updateSet(fields, ['name', 'department', 'phone', 'status', 'office', 'email'], 3);
    if (!sets.length) return Host.findById(id);
    return queryOne(`UPDATE ${T.hosts} SET ${sets.join(', ')} WHERE company_id = $1 AND id = $2 RETURNING *`, [cid(), id, ...vals]);
  },
  setStatus: (id, status) =>
    queryOne(`UPDATE ${T.hosts} SET status = $3 WHERE company_id = $1 AND id = $2 RETURNING *`, [cid(), id, status]),
  remove: (id) => queryOne(`DELETE FROM ${T.hosts} WHERE company_id = $1 AND id = $2 RETURNING *`, [cid(), id]),
};

export const Visitor = {
  listWithStats: () =>
    query(
      `SELECT v.*, COUNT(vs.id)::int AS visit_count, MAX(vs.visit_date) AS last_visit
       FROM ${T.visitors} v
       LEFT JOIN ${T.visits} vs ON vs.visitor_id = v.id AND vs.company_id = v.company_id
       WHERE v.company_id = $1
       GROUP BY v.id
       ORDER BY v.created_at DESC`,
      [cid()]
    ),
  findById: (id) => queryOne(`SELECT * FROM ${T.visitors} WHERE company_id = $1 AND id = $2`, [cid(), id]),
  findByPhone: (phone) =>
    queryOne(
      `SELECT * FROM ${T.visitors}
       WHERE company_id = $1 AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = $2
       ORDER BY created_at DESC LIMIT 1`,
      [cid(), normalizePhone(phone)]
    ),
  create: ({ name, company = '—', status = 'active', phone = null, email = '', profile_type = '' }) =>
    queryOne(
      `INSERT INTO ${T.visitors} (company_id, name, company, status, phone, email, profile_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [cid(), name, company, status, phone, email, profile_type]
    ),
  update: (id, fields) => {
    const { sets, vals } = updateSet(fields, ['name', 'company', 'status', 'phone', 'email', 'profile_type'], 3);
    if (!sets.length) return Visitor.findById(id);
    return queryOne(`UPDATE ${T.visitors} SET ${sets.join(', ')} WHERE company_id = $1 AND id = $2 RETURNING *`, [cid(), id, ...vals]);
  },
};

const VISIT_COLUMNS = `
  vs.*, vis.name AS visitor_name, vis.company AS visitor_company, vis.phone AS visitor_profile_phone, vis.email AS visitor_email,
  h.name AS host_name, h.department AS host_department, h.phone AS host_phone, h.office AS host_office`;
const VISIT_FROM = `
  FROM ${T.visits} vs
  JOIN ${T.visitors} vis ON vis.id = vs.visitor_id
  JOIN ${T.hosts} h ON h.id = vs.host_id`;
const VISIT_SELECT = `SELECT ${VISIT_COLUMNS} ${VISIT_FROM}`;

export const Visit = {
  list: ({ status, limit, hostId, fromDate, toDate } = {}) => {
    const where = ['vs.company_id = $1'];
    const vals = [cid()];
    if (status && status !== 'all') {
      vals.push(status);
      where.push(`vs.status = $${vals.length}`);
    }
    if (hostId) {
      vals.push(hostId);
      where.push(`vs.host_id = $${vals.length}`);
    }
    if (fromDate) {
      vals.push(fromDate);
      where.push(`vs.visit_date >= $${vals.length}`);
    }
    if (toDate) {
      vals.push(toDate);
      where.push(`vs.visit_date <= $${vals.length}`);
    }
    const lim = limit ? `LIMIT ${Number(limit) || 100}` : '';
    return query(`${VISIT_SELECT} WHERE ${where.join(' AND ')} ORDER BY vs.created_at DESC ${lim}`, vals);
  },
  findById: (id) => queryOne(`${VISIT_SELECT} WHERE vs.company_id = $1 AND vs.id = $2`, [cid(), id]),
  findByRef: (ref) =>
    queryOne(`${VISIT_SELECT} WHERE vs.company_id = $1 AND LOWER(vs.ref_number) = LOWER($2)`, [cid(), String(ref || '').trim()]),
  findByToken: (token) => queryOne(`${VISIT_SELECT} WHERE vs.company_id = $1 AND vs.qr_token = $2`, [cid(), token]),
  findByPin: (pin) =>
    queryOne(`${VISIT_SELECT} WHERE vs.company_id = $1 AND vs.pin = $2 ORDER BY vs.created_at DESC LIMIT 1`, [cid(), String(pin || '').trim()]),
  // The visitor's public pass page: the QR token is unique across the platform.
  findPublicByToken: (token) => queryOne(`${VISIT_SELECT} WHERE vs.qr_token = $1`, [token]),
  listByVisitorPhone: (phone, limit = 5) =>
    query(
      `${VISIT_SELECT}
       WHERE vs.company_id = $1 AND regexp_replace(COALESCE(vs.visitor_phone, vis.phone, ''), '[^0-9]', '', 'g') = $2
       ORDER BY vs.created_at DESC LIMIT ${Number(limit) || 5}`,
      [cid(), normalizePhone(phone)]
    ),
  countThisMonth: async (monthStart) =>
    Number((await queryOne(`SELECT COUNT(*)::int AS n FROM ${T.visits} WHERE company_id = $1 AND created_at >= $2::date`, [cid(), monthStart]))?.n || 0),
  create: (row) =>
    queryOne(
      `INSERT INTO ${T.visits}
        (company_id, ref_number, visitor_id, host_id, purpose, visit_date, visit_time, status, qr_token, visit_type,
         visitor_phone, kind, appointment_type, topic, flagged, flag_reason, screening)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb) RETURNING *`,
      [
        cid(),
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
        row.kind === 'appointment' ? 'appointment' : 'visit',
        row.appointment_type || '',
        row.topic || '',
        Boolean(row.flagged),
        row.flag_reason || '',
        JSON.stringify(row.screening || {}),
      ]
    ),
  // Only a pending visit can be decided; a second decision at the same moment gets null.
  decide: (id, status, qr_token, pin, decidedBy = '') =>
    queryOne(
      `UPDATE ${T.visits}
       SET status = $3, qr_token = COALESCE($4, qr_token), pin = COALESCE($5, pin), decided_at = NOW(), decided_by = $6
       WHERE company_id = $1 AND id = $2 AND status = 'pending' RETURNING *`,
      [cid(), id, status, qr_token, pin, decidedBy]
    ),
  setFlag: (id, flagged, reason = '') =>
    queryOne(`UPDATE ${T.visits} SET flagged = $3, flag_reason = $4 WHERE company_id = $1 AND id = $2 RETURNING *`, [cid(), id, flagged, reason]),
  mergeScreening: (id, patch) =>
    queryOne(`UPDATE ${T.visits} SET screening = screening || $3::jsonb WHERE company_id = $1 AND id = $2 RETURNING *`, [cid(), id, JSON.stringify(patch)]),
  setHostMessageId: (id, messageId) =>
    queryOne(`UPDATE ${T.visits} SET host_message_id = $3 WHERE company_id = $1 AND id = $2 RETURNING id`, [cid(), id, messageId]),
  findByHostMessageId: (messageId) => queryOne(`${VISIT_SELECT} WHERE vs.company_id = $1 AND vs.host_message_id = $2`, [cid(), messageId]),
  listPendingForHost: (hostId, fromDate) =>
    query(
      `${VISIT_SELECT}
       WHERE vs.company_id = $1 AND vs.host_id = $2 AND vs.status = 'pending' AND vs.visit_date >= $3
       ORDER BY vs.visit_date ASC, vs.visit_time ASC, vs.id ASC`,
      [cid(), hostId, fromDate]
    ),
  setStatus: (id, status) => queryOne(`UPDATE ${T.visits} SET status = $3 WHERE company_id = $1 AND id = $2 RETURNING *`, [cid(), id, status]),
  reschedule: (id, date, time) =>
    queryOne(
      `UPDATE ${T.visits}
       SET visit_date = $3, visit_time = $4, status = 'pending', qr_token = NULL, pin = NULL, decided_at = NULL,
           reminder_sent_at = NULL, decided_by = ''
       WHERE company_id = $1 AND id = $2 RETURNING *`,
      [cid(), id, date, time]
    ),
  listOpenFrom: (date) =>
    query(
      `SELECT ref_number, host_id, visit_date, visit_time, status FROM ${T.visits}
       WHERE company_id = $1 AND status IN ('pending', 'approved') AND visit_date >= $2`,
      [cid(), date]
    ),
  // Checks a visitor in once: a second scan at the same moment gets null.
  markUsed: (id) =>
    queryOne(
      `UPDATE ${T.visits} SET used_at = NOW(), status = 'used'
       WHERE company_id = $1 AND id = $2 AND status = 'approved' AND used_at IS NULL RETURNING *`,
      [cid(), id]
    ),
  checkOut: (id) =>
    queryOne(
      `UPDATE ${T.visits} SET checked_out_at = NOW()
       WHERE company_id = $1 AND id = $2 AND status = 'used' AND checked_out_at IS NULL RETURNING *`,
      [cid(), id]
    ),
  // Approved visits starting between two moments that have not been reminded yet.
  listDueReminders: (date, fromTime, toTime) =>
    query(
      `${VISIT_SELECT}
       WHERE vs.company_id = $1 AND vs.status = 'approved' AND vs.reminder_sent_at IS NULL
         AND vs.visit_date = $2 AND vs.visit_time > $3 AND vs.visit_time <= $4`,
      [cid(), date, fromTime, toTime]
    ),
  markReminded: (id) =>
    queryOne(`UPDATE ${T.visits} SET reminder_sent_at = NOW() WHERE company_id = $1 AND id = $2 AND reminder_sent_at IS NULL RETURNING id`, [cid(), id]),
  // Gate traffic: check-ins and check-outs on a date.
  listGateActivity: (date) =>
    query(
      `${VISIT_SELECT}
       WHERE vs.company_id = $1 AND (vs.used_at::date = $2::date OR vs.checked_out_at::date = $2::date OR vs.visit_date = $2::date)
       ORDER BY COALESCE(vs.checked_out_at, vs.used_at, vs.created_at) DESC`,
      [cid(), date]
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

function conversationKey(phone) {
  return normalizePhone(phone) || String(phone || '').trim();
}

// One conversation per visitor phone number per company.
export const ConversationState = {
  findByPhone: async (phone) => {
    const key = conversationKey(phone);
    if (!key) return null;
    return hydrateConversation(await queryOne(`SELECT * FROM ${T.conversations} WHERE company_id = $1 AND phone_number = $2`, [cid(), key]));
  },
  upsert: async (phone, current_step, collected_data = {}) =>
    hydrateConversation(
      await queryOne(
        `INSERT INTO ${T.conversations} (company_id, phone_number, current_step, collected_data, account_id, updated_at)
         VALUES ($1,$2,$3,$4::jsonb,0, NOW())
         ON CONFLICT (company_id, phone_number) DO UPDATE
           SET current_step = EXCLUDED.current_step, collected_data = EXCLUDED.collected_data, updated_at = NOW()
         RETURNING *`,
        [cid(), conversationKey(phone), current_step, JSON.stringify(collected_data || {})]
      )
    ),
  clear: (phone) => query(`DELETE FROM ${T.conversations} WHERE company_id = $1 AND phone_number = $2`, [cid(), conversationKey(phone)]),
};

export const Knowledge = {
  listAll: () => query(`SELECT * FROM ${T.knowledge} WHERE company_id = $1 ORDER BY kind ASC, id ASC`, [cid()]),
  count: async () =>
    Number((await queryOne(`SELECT COUNT(*)::int AS n FROM ${T.knowledge} WHERE company_id = $1 AND kind NOT IN ('greeting', 'instruction')`, [cid()]))?.n || 0),
  findById: (id) => queryOne(`SELECT * FROM ${T.knowledge} WHERE company_id = $1 AND id = $2`, [cid(), id]),
  create: ({ kind, title = '', question = '', answer = '' }) =>
    queryOne(
      `INSERT INTO ${T.knowledge} (company_id, account_id, kind, title, question, answer) VALUES ($1,NULL,$2,$3,$4,$5) RETURNING *`,
      [cid(), kind || 'qa', title, question, answer]
    ),
  update: (id, fields) => {
    const { sets, vals } = updateSet(fields, ['kind', 'title', 'question', 'answer'], 3);
    if (!sets.length) return Knowledge.findById(id);
    return queryOne(`UPDATE ${T.knowledge} SET ${sets.join(', ')} WHERE company_id = $1 AND id = $2 RETURNING *`, [cid(), id, ...vals]);
  },
  remove: (id) => queryOne(`DELETE FROM ${T.knowledge} WHERE company_id = $1 AND id = $2 RETURNING *`, [cid(), id]),
  upsertByKind: async (kind, { title = '', question = '', answer = '' }) => {
    const existing = await queryOne(`SELECT * FROM ${T.knowledge} WHERE company_id = $1 AND kind = $2 ORDER BY id ASC LIMIT 1`, [cid(), kind]);
    if (existing) return Knowledge.update(existing.id, { title, question, answer });
    return Knowledge.create({ kind, title, question, answer });
  },
};

export const ConversationLog = {
  add: ({ phone_number, visit_id = null, direction, message_text }) =>
    queryOne(
      `INSERT INTO ${T.conversationLog} (company_id, phone_number, visit_id, direction, message_text) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [cid(), normalizePhone(phone_number), visit_id || null, direction, String(message_text || '')]
    ),
  linkVisit: (phone, visitId, windowHours = 24) =>
    query(
      `UPDATE ${T.conversationLog} SET visit_id = $3
       WHERE company_id = $1 AND regexp_replace(phone_number, '[^0-9]', '', 'g') = $2
         AND (visit_id IS NULL OR visit_id = $3)
         AND created_at >= NOW() - ($4::text || ' hours')::interval`,
      [cid(), normalizePhone(phone), visitId, String(windowHours)]
    ),
  listByPhone: (phone) =>
    query(
      `SELECT id, phone_number, visit_id, direction, message_text, created_at FROM ${T.conversationLog}
       WHERE company_id = $1 AND regexp_replace(phone_number, '[^0-9]', '', 'g') = $2
       ORDER BY created_at ASC, id ASC`,
      [cid(), normalizePhone(phone)]
    ),
  listThreads: () =>
    query(
      `SELECT cl.phone_number AS phone, COUNT(*)::int AS message_count, MAX(cl.created_at) AS last_at,
         (SELECT c2.message_text FROM ${T.conversationLog} c2
           WHERE c2.company_id = cl.company_id AND c2.phone_number = cl.phone_number
           ORDER BY c2.created_at DESC, c2.id DESC LIMIT 1) AS last_message,
         (SELECT vis.name FROM ${T.visitors} vis
           WHERE vis.company_id = cl.company_id AND regexp_replace(COALESCE(vis.phone, ''), '[^0-9]', '', 'g') = cl.phone_number
           ORDER BY vis.created_at DESC LIMIT 1) AS visitor_name,
         (SELECT h.ref_number FROM ${T.handovers} h
           WHERE h.company_id = cl.company_id AND h.phone = cl.phone_number AND h.status = 'open'
           ORDER BY h.created_at DESC LIMIT 1) AS open_handover
       FROM ${T.conversationLog} cl
       WHERE cl.company_id = $1
       GROUP BY cl.company_id, cl.phone_number
       ORDER BY last_at DESC`,
      [cid()]
    ),
};

export const Feedback = {
  list: () =>
    query(
      `SELECT f.*, v.name AS visitor_name FROM ${T.feedback} f
       LEFT JOIN ${T.visitors} v ON v.id = f.visitor_id
       WHERE f.company_id = $1 ORDER BY f.created_at DESC LIMIT 500`,
      [cid()]
    ),
  create: (row) =>
    queryOne(
      `INSERT INTO ${T.feedback} (company_id, ref_number, phone, visitor_id, visit_id, topic, rating, comment, is_complaint, contact_requested)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [cid(), row.ref_number, row.phone, row.visitor_id || null, row.visit_id || null, row.topic, row.rating ?? null, row.comment || '', Boolean(row.is_complaint), Boolean(row.contact_requested)]
    ),
  listByPhone: (phone, limit = 3) =>
    query(
      `SELECT * FROM ${T.feedback} WHERE company_id = $1 AND phone = $2 ORDER BY created_at DESC LIMIT ${Number(limit) || 3}`,
      [cid(), normalizePhone(phone)]
    ),
  setStatus: (id, status) => queryOne(`UPDATE ${T.feedback} SET status = $3 WHERE company_id = $1 AND id = $2 RETURNING *`, [cid(), id, status]),
};

export const ServiceRequest = {
  list: () =>
    query(
      `SELECT s.*, v.name AS visitor_name,
         (SELECT d.id FROM ${T.documents} d WHERE d.service_request_id = s.id AND d.company_id = s.company_id LIMIT 1) AS attachment_id
       FROM ${T.serviceRequests} s
       LEFT JOIN ${T.visitors} v ON v.id = s.visitor_id
       WHERE s.company_id = $1 ORDER BY s.created_at DESC LIMIT 500`,
      [cid()]
    ),
  findById: (id) => queryOne(`SELECT * FROM ${T.serviceRequests} WHERE company_id = $1 AND id = $2`, [cid(), id]),
  listByPhone: (phone, limit = 5) =>
    query(
      `SELECT * FROM ${T.serviceRequests} WHERE company_id = $1 AND phone = $2 ORDER BY created_at DESC LIMIT ${Number(limit) || 5}`,
      [cid(), normalizePhone(phone)]
    ),
  create: (row) =>
    queryOne(
      `INSERT INTO ${T.serviceRequests} (company_id, ref_number, phone, visitor_id, category, description, priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [cid(), row.ref_number, normalizePhone(row.phone), row.visitor_id || null, row.category, row.description, row.priority]
    ),
  update: (id, fields) => {
    const { sets, vals } = updateSet(fields, ['status', 'staff_note', 'priority'], 3);
    if (!sets.length) return ServiceRequest.findById(id);
    return queryOne(
      `UPDATE ${T.serviceRequests} SET ${sets.join(', ')}, updated_at = NOW() WHERE company_id = $1 AND id = $2 RETURNING *`,
      [cid(), id, ...vals]
    );
  },
};

export const Handover = {
  openForPhone: (phone) =>
    queryOne(
      `SELECT * FROM ${T.handovers} WHERE company_id = $1 AND phone = $2 AND status = 'open' ORDER BY created_at DESC LIMIT 1`,
      [cid(), normalizePhone(phone)]
    ),
  listOpen: () => query(`SELECT * FROM ${T.handovers} WHERE company_id = $1 AND status = 'open' ORDER BY created_at ASC`, [cid()]),
  create: ({ ref_number, phone, department }) =>
    queryOne(
      `INSERT INTO ${T.handovers} (company_id, ref_number, phone, department) VALUES ($1,$2,$3,$4) RETURNING *`,
      [cid(), ref_number, normalizePhone(phone), department]
    ),
  close: (phone, closedBy) =>
    query(
      `UPDATE ${T.handovers} SET status = 'closed', closed_at = NOW(), closed_by = $3
       WHERE company_id = $1 AND phone = $2 AND status = 'open' RETURNING *`,
      [cid(), normalizePhone(phone), closedBy]
    ),
};

export const Document = {
  create: ({ kind, phone, visitor_id = null, visit_id = null, service_request_id = null, mime, file_name = '', data }) =>
    queryOne(
      `INSERT INTO ${T.documents} (company_id, kind, phone, visitor_id, visit_id, service_request_id, mime, file_name, size_bytes, data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, kind, mime, size_bytes, created_at`,
      [cid(), kind, normalizePhone(phone), visitor_id, visit_id, service_request_id, mime, file_name, data.length, data]
    ),
  find: (id) => queryOne(`SELECT * FROM ${T.documents} WHERE company_id = $1 AND id = $2`, [cid(), id]),
  latestIdForVisitor: (visitorId) =>
    queryOne(
      `SELECT id, created_at FROM ${T.documents} WHERE company_id = $1 AND visitor_id = $2 AND kind = 'id_document' ORDER BY created_at DESC LIMIT 1`,
      [cid(), visitorId]
    ),
  forVisit: (visitId) =>
    queryOne(
      `SELECT d.id FROM ${T.documents} d
       JOIN ${T.visits} vs ON vs.id = $2 AND vs.company_id = d.company_id
       WHERE d.company_id = $1 AND d.kind = 'id_document' AND (d.visit_id = vs.id OR d.visitor_id = vs.visitor_id)
       ORDER BY (d.visit_id = vs.id) DESC, d.created_at DESC LIMIT 1`,
      [cid(), visitId]
    ),
  linkVisit: (id, visitId) => query(`UPDATE ${T.documents} SET visit_id = $3 WHERE company_id = $1 AND id = $2`, [cid(), id, visitId]),
  linkServiceRequest: (id, requestId) =>
    query(`UPDATE ${T.documents} SET service_request_id = $3 WHERE company_id = $1 AND id = $2`, [cid(), id, requestId]),
};

// Company audit trail (current company), and platform audit trail (company_id NULL).
export const Audit = {
  list: (limit) =>
    query(`SELECT * FROM ${T.audit} WHERE company_id = $1 ORDER BY created_at DESC LIMIT ${Number(limit) || 200}`, [cid()]),
  // A company event when there is a company context, otherwise a platform event.
  add: ({ actor, action, details, companyId }) =>
    queryOne(
      `INSERT INTO ${T.audit} (actor, action, details, company_id) VALUES ($1,$2,$3,$4) RETURNING *`,
      [actor, action, details || '', companyId === undefined ? optionalTenantId() : companyId]
    ),
  platform: ({ actor, action, details }) =>
    queryOne(`INSERT INTO ${T.audit} (actor, action, details, company_id) VALUES ($1,$2,$3,NULL) RETURNING *`, [actor, action, details || '']),
  listPlatform: ({ scope = 'platform', companyId = null, limit = 300 } = {}) => {
    if (scope === 'company' && companyId) {
      return query(
        `SELECT a.*, c.name AS company_name FROM ${T.audit} a LEFT JOIN ${T.companies} c ON c.id = a.company_id
         WHERE a.company_id = $1 ORDER BY a.created_at DESC LIMIT ${Number(limit) || 300}`,
        [companyId]
      );
    }
    if (scope === 'all') {
      return query(
        `SELECT a.*, c.name AS company_name FROM ${T.audit} a LEFT JOIN ${T.companies} c ON c.id = a.company_id
         ORDER BY a.created_at DESC LIMIT ${Number(limit) || 300}`
      );
    }
    return query(`SELECT a.*, NULL AS company_name FROM ${T.audit} a WHERE a.company_id IS NULL ORDER BY a.created_at DESC LIMIT ${Number(limit) || 300}`);
  },
};

// ===================================================================== Company statistics

export async function companyDashboard(today) {
  const id = cid();
  const one = async (sql, params) => Number((await queryOne(sql, params))?.n || 0);
  const [pending, today_visits, on_site, checked_in_today, active_hosts, open_requests, open_handovers, feedback_avg] = await Promise.all([
    one(`SELECT COUNT(*)::int AS n FROM ${T.visits} WHERE company_id = $1 AND status = 'pending'`, [id]),
    one(`SELECT COUNT(*)::int AS n FROM ${T.visits} WHERE company_id = $1 AND visit_date = $2`, [id, today]),
    one(`SELECT COUNT(*)::int AS n FROM ${T.visits} WHERE company_id = $1 AND status = 'used' AND checked_out_at IS NULL AND used_at::date = $2::date`, [id, today]),
    one(`SELECT COUNT(*)::int AS n FROM ${T.visits} WHERE company_id = $1 AND used_at::date = $2::date`, [id, today]),
    one(`SELECT COUNT(*)::int AS n FROM ${T.hosts} WHERE company_id = $1 AND status = 'active'`, [id]),
    one(`SELECT COUNT(*)::int AS n FROM ${T.serviceRequests} WHERE company_id = $1 AND status IN ('open', 'in_progress')`, [id]),
    one(`SELECT COUNT(*)::int AS n FROM ${T.handovers} WHERE company_id = $1 AND status = 'open'`, [id]),
    queryOne(`SELECT ROUND(AVG(rating)::numeric, 1) AS n FROM ${T.feedback} WHERE company_id = $1 AND rating IS NOT NULL`, [id]).then((r) => (r?.n == null ? null : Number(r.n))),
  ]);
  return { pending, today_visits, on_site, checked_in_today, active_hosts, open_requests, open_handovers, feedback_avg };
}

export async function companyReport(fromDate, toDate) {
  const id = cid();
  const [byDay, byHour, byHost, byStatus, byType] = await Promise.all([
    query(
      `SELECT visit_date AS day, COUNT(*)::int AS visits FROM ${T.visits}
       WHERE company_id = $1 AND visit_date BETWEEN $2 AND $3 GROUP BY visit_date ORDER BY visit_date`,
      [id, fromDate, toDate]
    ),
    query(
      `SELECT EXTRACT(HOUR FROM used_at AT TIME ZONE $4)::int AS hour, COUNT(*)::int AS check_ins FROM ${T.visits}
       WHERE company_id = $1 AND used_at IS NOT NULL AND (used_at AT TIME ZONE $4)::date BETWEEN $2 AND $3
       GROUP BY hour ORDER BY hour`,
      [id, fromDate, toDate, process.env.ORG_TIMEZONE || 'Africa/Gaborone']
    ),
    query(
      `SELECT h.name AS host, h.department, COUNT(vs.id)::int AS visits,
              COUNT(*) FILTER (WHERE vs.status IN ('approved', 'used'))::int AS approved,
              COUNT(*) FILTER (WHERE vs.status = 'rejected')::int AS rejected
       FROM ${T.visits} vs JOIN ${T.hosts} h ON h.id = vs.host_id
       WHERE vs.company_id = $1 AND vs.visit_date BETWEEN $2 AND $3
       GROUP BY h.name, h.department ORDER BY visits DESC`,
      [id, fromDate, toDate]
    ),
    query(
      `SELECT status, COUNT(*)::int AS count FROM ${T.visits} WHERE company_id = $1 AND visit_date BETWEEN $2 AND $3 GROUP BY status`,
      [id, fromDate, toDate]
    ),
    query(
      `SELECT visit_type, COUNT(*)::int AS count FROM ${T.visits} WHERE company_id = $1 AND visit_date BETWEEN $2 AND $3 GROUP BY visit_type`,
      [id, fromDate, toDate]
    ),
  ]);
  return { byDay, byHour, byHost, byStatus, byType };
}

// ===================================================================== Platform statistics

export async function platformCounts() {
  const one = async (sql) => Number((await queryOne(sql))?.n || 0);
  const [companies, active, suspended, terminated, users, hosts, visitors, visits, visits30, whatsappLinked] = await Promise.all([
    one(`SELECT COUNT(*)::int AS n FROM ${T.companies}`),
    one(`SELECT COUNT(*)::int AS n FROM ${T.companies} WHERE status = 'active'`),
    one(`SELECT COUNT(*)::int AS n FROM ${T.companies} WHERE status = 'suspended'`),
    one(`SELECT COUNT(*)::int AS n FROM ${T.companies} WHERE status = 'terminated'`),
    one(`SELECT COUNT(*)::int AS n FROM ${T.admins}`),
    one(`SELECT COUNT(*)::int AS n FROM ${T.hosts}`),
    one(`SELECT COUNT(*)::int AS n FROM ${T.visitors}`),
    one(`SELECT COUNT(*)::int AS n FROM ${T.visits}`),
    one(`SELECT COUNT(*)::int AS n FROM ${T.visits} WHERE created_at >= NOW() - INTERVAL '30 days'`),
    one(`SELECT COUNT(*)::int AS n FROM ${T.companyWhatsApp} WHERE status = 'connected'`),
  ]);
  return { companies, active, suspended, terminated, users, hosts, visitors, visits, visits30, whatsappLinked };
}

// Per company: rows and bytes stored, messages and visits this month.
export async function meteringByCompany(monthStart) {
  const tables = [T.hosts, T.visitors, T.visits, T.conversationLog, T.conversations, T.knowledge, T.feedback, T.serviceRequests, T.handovers, T.documents];
  const storage = {};
  for (const table of tables) {
    const rows = await query(`SELECT company_id, COUNT(*)::int AS n, COALESCE(SUM(pg_column_size(t.*)), 0)::bigint AS bytes FROM ${table} t GROUP BY company_id`);
    for (const r of rows) {
      const s = (storage[r.company_id] ||= { rows: 0, bytes: 0 });
      s.rows += Number(r.n);
      s.bytes += Number(r.bytes);
    }
  }
  const messages = await query(
    `SELECT company_id, COUNT(*) FILTER (WHERE direction = 'incoming')::int AS incoming,
            COUNT(*) FILTER (WHERE direction = 'outgoing')::int AS outgoing,
            COALESCE(SUM(octet_length(message_text)), 0)::bigint AS bytes
     FROM ${T.conversationLog} WHERE created_at >= $1::date GROUP BY company_id`,
    [monthStart]
  );
  const visits = await query(`SELECT company_id, COUNT(*)::int AS n FROM ${T.visits} WHERE created_at >= $1::date GROUP BY company_id`, [monthStart]);
  return { storage, messages, visits };
}
