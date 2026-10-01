// Demo data for a fresh local database. Never run automatically.
//
//   SEED_ADMIN_PASSWORD='…' npm run seed          (or run it and type the password when asked)
//
// Creates one super_admin login and demo hosts, visitors and visits.
//
// Refuses to run when NODE_ENV=production or when an admin already exists, so it can never
// overwrite or add to a live system. No password is stored in this file or printed.
import crypto from 'crypto';
import readline from 'readline/promises';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MIN_PASSWORD = 10;

const { pool, query, queryOne } = await import('../src/config/db.js');
const { T } = await import('../src/config/tables.js');

async function askPassword(label) {
  if (!process.stdin.isTTY) return '';
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(`${label}: `)).trim();
  } finally {
    rl.close();
  }
}

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed: NODE_ENV is production.');
  }
  const admins = await queryOne(`SELECT COUNT(*)::int AS n FROM ${T.admins}`);
  if (admins?.n > 0) {
    throw new Error('Refusing to seed: an admin account already exists. Seeding is only for a fresh database.');
  }

  const adminUsername = (process.env.SEED_ADMIN_USERNAME || 'admin').trim();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || (await askPassword(`Password for admin "${adminUsername}"`));
  if (adminPassword.length < MIN_PASSWORD) {
    throw new Error(`Set SEED_ADMIN_PASSWORD (or type a password) of at least ${MIN_PASSWORD} characters.`);
  }
  await query(`INSERT INTO ${T.admins} (username, password_hash, name, role, status) VALUES ($1, $2, 'Admin', 'super_admin', 'active')`, [
    adminUsername,
    await bcrypt.hash(adminPassword, 10),
  ]);

  // Demo hosts have no phone number, so no WhatsApp notification is ever sent to a stranger.
  async function ensureHost(name, department, accountId = null) {
    const existing = await queryOne(`SELECT * FROM ${T.hosts} WHERE LOWER(name) = LOWER($1)`, [name]);
    if (existing) return existing;
    return queryOne(
      `INSERT INTO ${T.hosts} (name, department, phone, status, account_id)
       VALUES ($1,$2,'','active',$3) RETURNING *`,
      [name, department, accountId]
    );
  }

  const h1 = await ensureHost('Boikarabelo Ramaretlwa', 'Technology Planning');
  const h2 = await ensureHost('Naledi Kgosi', 'Human Resources');
  const h3 = await ensureHost('Tshepo Molefe', 'Finance');

  async function ensureVisitor(name, company) {
    const existing = await queryOne(`SELECT * FROM ${T.visitors} WHERE LOWER(name) = LOWER($1)`, [name]);
    if (existing) return existing;
    return queryOne(`INSERT INTO ${T.visitors} (name, company, status) VALUES ($1,$2,'active') RETURNING *`, [name, company]);
  }

  const v1 = await ensureVisitor('Michael Ntsima', 'University of Botswana');
  const v2 = await ensureVisitor('Grace Mokoena', 'Aurora Retail Group');
  const v3 = await ensureVisitor('Daniel Osei', 'Pinnacle Logistics');

  async function ensureVisit(ref, visitorId, hostId, purpose, date, time, status) {
    const existing = await queryOne(`SELECT * FROM ${T.visits} WHERE ref_number = $1`, [ref]);
    if (existing) return existing;
    const approved = status === 'approved';
    return queryOne(
      `INSERT INTO ${T.visits} (ref_number, visitor_id, host_id, purpose, visit_date, visit_time, status, qr_token, pin, decided_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, CASE WHEN $7 = 'pending' THEN NULL ELSE NOW() END)
       RETURNING *`,
      [
        ref,
        visitorId,
        hostId,
        purpose,
        date,
        time,
        status,
        approved ? crypto.randomBytes(32).toString('hex') : null,
        approved ? String(crypto.randomInt(100000, 1000000)) : null,
      ]
    );
  }

  await ensureVisit('VMS-2026-001245', v1.id, h1.id, 'Technology Planning Meeting', '2026-09-22', '10:00', 'approved');
  await ensureVisit('VMS-2026-002210', v2.id, h1.id, 'Interview — Ops Manager', '2026-09-22', '13:30', 'pending');
  await ensureVisit('VMS-2026-003101', v2.id, h2.id, 'Interview — Ops Manager', '2026-09-22', '13:30', 'pending');
  await ensureVisit('VMS-2026-004018', v3.id, h3.id, 'Vendor onboarding', '2026-09-21', '09:15', 'rejected');
  await ensureVisit('VMS-2026-005540', v1.id, h1.id, 'Follow-up review', '2026-09-18', '11:00', 'approved');

  const auditExists = await queryOne(`SELECT id FROM ${T.audit} LIMIT 1`);
  if (!auditExists) {
    await query(`INSERT INTO ${T.audit} (actor, action, details) VALUES ('Admin', 'System initialized', 'Demo data seeded')`);
  }

  console.log(`Seed complete. Super admin username: ${adminUsername}`);
}

try {
  await seed();
} catch (err) {
  console.error('Seed failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
