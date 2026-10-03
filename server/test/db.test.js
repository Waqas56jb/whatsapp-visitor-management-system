// Migration checks against a real, throwaway PostgreSQL database. Skipped unless
// TEST_DATABASE_URL is set — never point it at a database you care about: each run creates and
// drops its own scratch database on that server.
//
//   docker run -d --rm --name vms-test-db -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16-alpine
//   TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:55432/postgres node --test test/db.test.js
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { createScratchDatabase, dropScratchDatabase, MIGRATIONS, migrationSql } from './helpers/testDb.js';

const P = 'whatsapp_visitor_management_';

describe('migrations on a real database', { skip: !process.env.TEST_DATABASE_URL && 'set TEST_DATABASE_URL to run' }, () => {
  let client;
  let db;
  const run = (sql, params) => client.query(sql, params);
  const apply = async (files) => {
    for (const file of files) await run(migrationSql(file));
  };
  const before013 = MIGRATIONS.slice(0, MIGRATIONS.indexOf('013_multitenancy.sql'));

  before(async () => {
    db = await createScratchDatabase('migrations');
    client = new pg.Client({ connectionString: db.url });
    await client.connect();
  });

  after(async () => {
    await client?.end();
    if (db) await dropScratchDatabase(db.name);
  });

  test('the single-organisation data becomes company 1, with roles mapped', async () => {
    await apply(before013);
    await run(`INSERT INTO ${P}admins (username, password_hash, name, role) VALUES ('owner', 'x', 'Owner', 'super_admin'), ('ops', 'x', 'Ops', 'admin'), ('desk', 'x', 'Desk', 'reception')`);
    await run(`UPDATE ${P}settings SET org_name = 'Botho Innovations', phone = '+267 1', email = 'info@botho.bw' WHERE id = 1`);
    const host = (await run(`INSERT INTO ${P}hosts (name, department, phone, status) VALUES ('John Smith', 'HR', '26771111111', 'active') RETURNING id`)).rows[0];
    const visitor = (await run(`INSERT INTO ${P}visitors (name, company, status, phone) VALUES ('Kabelo', 'Orange', 'active', '26772222222') RETURNING id`)).rows[0];
    await run(`INSERT INTO ${P}visits (ref_number, visitor_id, host_id, purpose, visit_date, visit_time, status) VALUES ('VMS-2026-000001', $1, $2, 'Meeting', '2026-10-06', '10:00', 'pending')`, [visitor.id, host.id]);
    await run(`INSERT INTO ${P}conversation_states (phone_number, current_step, collected_data, account_id) VALUES ('26772222222', 'idle', '{}', 0)`);
    await run(`INSERT INTO ${P}audit_log (actor, action, details) VALUES ('Owner', 'Approved visit', 'VMS-2026-000001')`);
    await run(`UPDATE ${P}company_whatsapp SET status = 'connected', phone = '26770000000', keys = '{"creds.json": "{}"}' WHERE id = 1`);

    await apply(['013_multitenancy.sql']);

    const company = (await run(`SELECT id, name, plan, status, settings FROM ${P}companies`)).rows;
    assert.equal(company.length, 1);
    assert.deepEqual({ ...company[0], settings: undefined }, { id: 1, name: 'Botho Innovations', plan: 'enterprise', status: 'active', settings: undefined });
    assert.equal(company[0].settings.email, 'info@botho.bw');
    for (const table of ['hosts', 'visitors', 'visits', 'conversation_states', 'audit_log']) {
      const rows = (await run(`SELECT company_id FROM ${P}${table}`)).rows;
      assert.ok(rows.length > 0 && rows.every((r) => r.company_id === 1), `${table} belongs to company 1`);
    }
    const admins = (await run(`SELECT username, role, company_id FROM ${P}admins ORDER BY username`)).rows;
    assert.deepEqual(admins, [
      { username: 'desk', role: 'company_security', company_id: 1 },
      { username: 'ops', role: 'company_admin', company_id: 1 },
      { username: 'owner', role: 'super_admin', company_id: null },
    ]);
    const wa = (await run(`SELECT company_id, status, phone, keys FROM ${P}company_whatsapp`)).rows;
    assert.deepEqual(wa, [{ company_id: 1, status: 'connected', phone: '26770000000', keys: { 'creds.json': '{}' } }]);
  });

  test('re-running every migration changes nothing and never reassigns platform audit rows', async () => {
    await run(`INSERT INTO ${P}audit_log (actor, action, details, company_id) VALUES ('Owner', 'Created company', 'platform event', NULL)`);
    const before = (await run(`SELECT (SELECT COUNT(*) FROM ${P}admins) a, (SELECT COUNT(*) FROM ${P}visits) v, (SELECT COUNT(*) FROM ${P}companies) c`)).rows[0];
    await apply(MIGRATIONS);
    const afterCounts = (await run(`SELECT (SELECT COUNT(*) FROM ${P}admins) a, (SELECT COUNT(*) FROM ${P}visits) v, (SELECT COUNT(*) FROM ${P}companies) c`)).rows[0];
    assert.deepEqual(afterCounts, before);
    const platform = (await run(`SELECT company_id FROM ${P}audit_log WHERE details = 'platform event'`)).rows[0];
    assert.equal(platform.company_id, null);
    const roles = (await run(`SELECT username, role FROM ${P}admins ORDER BY username`)).rows.map((r) => `${r.username}:${r.role}`);
    assert.deepEqual(roles, ['desk:company_security', 'ops:company_admin', 'owner:super_admin']);
  });

  test('platform roles have no company; company roles need one; unknown roles are refused', async () => {
    await assert.rejects(run(`INSERT INTO ${P}admins (username, password_hash, name, role, company_id) VALUES ('p1', 'x', 'P', 'super_admin', 1)`));
    await assert.rejects(run(`INSERT INTO ${P}admins (username, password_hash, name, role) VALUES ('c1', 'x', 'C', 'company_admin')`));
    await assert.rejects(run(`INSERT INTO ${P}admins (username, password_hash, name, role, company_id) VALUES ('h1', 'x', 'H', 'host', 1)`));
    await assert.rejects(run(`UPDATE ${P}admins SET status = 'disabled' WHERE username = 'owner'`));
    await run(`INSERT INTO ${P}admins (username, password_hash, name, role) VALUES ('support', 'x', 'S', 'platform_support')`);
  });

  test('the same phone has one conversation per company; companies keep separate WhatsApp rows', async () => {
    const two = (await run(`INSERT INTO ${P}companies (name) VALUES ('Acme') RETURNING id`)).rows[0].id;
    await run(`INSERT INTO ${P}conversation_states (company_id, phone_number, current_step, collected_data, account_id) VALUES ($1, '26772222222', 'idle', '{}', 0)`, [two]);
    await assert.rejects(run(`INSERT INTO ${P}conversation_states (company_id, phone_number, current_step, collected_data, account_id) VALUES (1, '26772222222', 'idle', '{}', 0)`));
    await run(`INSERT INTO ${P}company_whatsapp (company_id) VALUES ($1)`, [two]);
    await assert.rejects(run(`INSERT INTO ${P}company_whatsapp (company_id) VALUES ($1)`, [two]));
    const rows = (await run(`SELECT company_id FROM ${P}company_whatsapp ORDER BY company_id`)).rows.map((r) => r.company_id);
    assert.deepEqual(rows, [1, two]);
  });

  test('deleting a company deletes all of its data and nothing else', async () => {
    const id = (await run(`SELECT id FROM ${P}companies WHERE name = 'Acme'`)).rows[0].id;
    const host = (await run(`INSERT INTO ${P}hosts (company_id, name, department, phone, status) VALUES ($1, 'A Host', 'Ops', '', 'active') RETURNING id`, [id])).rows[0];
    await run(`INSERT INTO ${P}admins (username, password_hash, name, role, company_id) VALUES ('acme.admin', 'x', 'A', 'company_admin', $1)`, [id]);
    await run(`INSERT INTO ${P}feedback (company_id, ref_number, topic) VALUES ($1, 'FB-1', 'general')`, [id]);
    await run(`DELETE FROM ${P}companies WHERE id = $1`, [id]);
    for (const table of ['hosts', 'admins', 'feedback', 'conversation_states', 'company_whatsapp']) {
      const n = (await run(`SELECT COUNT(*)::int AS n FROM ${P}${table} WHERE company_id = $1`, [id])).rows[0].n;
      assert.equal(n, 0, `${table} rows of the deleted company`);
    }
    assert.equal((await run(`SELECT COUNT(*)::int AS n FROM ${P}hosts WHERE id = $1`, [host.id])).rows[0].n, 0);
    assert.equal((await run(`SELECT COUNT(*)::int AS n FROM ${P}hosts WHERE company_id = 1`)).rows[0].n, 1);
  });

  test('knowledge rows no longer depend on portal accounts', async () => {
    const fks = (
      await run(`SELECT confrelid::regclass::text AS target FROM pg_constraint WHERE conrelid = '${P}knowledge_base'::regclass AND contype = 'f'`)
    ).rows.map((r) => r.target);
    assert.deepEqual(fks, [`${P}companies`]);
  });
});
