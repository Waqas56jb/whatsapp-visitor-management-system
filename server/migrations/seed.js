import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { pool, query, queryOne } = await import('../src/config/db.js');
const { T } = await import('../src/config/tables.js');

async function seed() {
  const adminHash = await bcrypt.hash('admin123', 10);
  const hostHash = await bcrypt.hash('host2026', 10);

  await query(
    `INSERT INTO ${T.admins} (username, password_hash, name)
     VALUES ('admin', $1, 'Admin')
     ON CONFLICT (username) DO NOTHING`,
    [adminHash]
  );

  const account = await queryOne(
    `INSERT INTO ${T.accounts} (name, username, password_hash, role, status)
     VALUES ('Boikarabelo Ramaretlwa', 'boikarabelo', $1, 'Host', 'active')
     ON CONFLICT (username) DO UPDATE SET name = EXCLUDED.name
     RETURNING *`,
    [hostHash]
  );

  async function ensureHost(name, department, phone, accountId = null) {
    const existing = await queryOne(`SELECT * FROM ${T.hosts} WHERE LOWER(name) = LOWER($1)`, [name]);
    if (existing) {
      if (accountId && !existing.account_id) {
        return queryOne(`UPDATE ${T.hosts} SET account_id = $2 WHERE id = $1 RETURNING *`, [existing.id, accountId]);
      }
      return existing;
    }
    return queryOne(
      `INSERT INTO ${T.hosts} (name, department, phone, status, account_id)
       VALUES ($1,$2,$3,'active',$4) RETURNING *`,
      [name, department, phone, accountId]
    );
  }

  const h1 = await ensureHost('Boikarabelo Ramaretlwa', 'Technology Planning', '+267 71 000 001', account.id);
  const h2 = await ensureHost('Naledi Kgosi', 'Human Resources', '+267 71 000 002');
  const h3 = await ensureHost('Tshepo Molefe', 'Finance', '+267 71 000 003');

  async function ensureVisitor(name, company) {
    const existing = await queryOne(`SELECT * FROM ${T.visitors} WHERE LOWER(name) = LOWER($1)`, [name]);
    if (existing) return existing;
    return queryOne(`INSERT INTO ${T.visitors} (name, company, status) VALUES ($1,$2,'active') RETURNING *`, [name, company]);
  }

  const v1 = await ensureVisitor('Michael Ntsima', 'University of Botswana');
  const v2 = await ensureVisitor('Grace Mokoena', 'Aurora Retail Group');
  const v3 = await ensureVisitor('Daniel Osei', 'Pinnacle Logistics');

  async function ensureVisit(ref, visitorId, hostId, purpose, date, time, status, pin) {
    const existing = await queryOne(`SELECT * FROM ${T.visits} WHERE ref_number = $1`, [ref]);
    if (existing) return existing;
    return queryOne(
      `INSERT INTO ${T.visits} (ref_number, visitor_id, host_id, purpose, visit_date, visit_time, status, pin, qr_token, decided_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, CASE WHEN $7 = 'pending' THEN NULL ELSE NOW() END)
       RETURNING *`,
      [ref, visitorId, hostId, purpose, date, time, status, pin, status === 'approved' ? 'seed-token-' + ref : null]
    );
  }

  await ensureVisit('VMS-2026-001245', v1.id, h1.id, 'Technology Planning Meeting', '2026-09-22', '10:00', 'approved', '984321');
  await ensureVisit('VMS-2026-002210', v2.id, h1.id, 'Interview — Ops Manager', '2026-09-22', '13:30', 'pending', '552017');
  await ensureVisit('VMS-2026-003101', v2.id, h2.id, 'Interview — Ops Manager', '2026-09-22', '13:30', 'pending', '441902');
  await ensureVisit('VMS-2026-004018', v3.id, h3.id, 'Vendor onboarding', '2026-09-21', '09:15', 'rejected', '330771');
  await ensureVisit('VMS-2026-005540', v1.id, h1.id, 'Follow-up review', '2026-09-18', '11:00', 'approved', '219884');

  const auditExists = await queryOne(`SELECT id FROM ${T.audit} LIMIT 1`);
  if (!auditExists) {
    await query(`INSERT INTO ${T.audit} (actor, action, details) VALUES ('Admin', 'System initialized', 'Demo data seeded')`);
  }

  await query(
    `INSERT INTO ${T.settings} (id, org_name, phone, email)
     VALUES (1, 'Botho Innovations', '+27 00 000 0000', 'support@bothoinnovations.com')
     ON CONFLICT (id) DO NOTHING`
  );

  console.log('Seed complete. Admin: admin / admin123  |  Host: boikarabelo / host2026');
}

try {
  await seed();
} catch (err) {
  console.error('Seed failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
