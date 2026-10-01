// Migration checks against a real, throwaway PostgreSQL database. Skipped unless
// TEST_DATABASE_URL is set — never point it at a database you care about: it creates tables.
//
//   docker run -d --rm --name vms-test-db -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16-alpine
//   TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:55432/postgres node --test test/db.test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const url = process.env.TEST_DATABASE_URL;
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
// The same files, in the same order, as `npm run migrate`.
const FILES = [...fs.readFileSync(path.join(dir, 'migrate.js'), 'utf8').matchAll(/'([\w.]+\.sql)'/g)].map((m) => m[1]);
const P = 'whatsapp_visitor_management_';

describe('migrations on a real database', { skip: !url && 'set TEST_DATABASE_URL to run' }, () => {
  let client;
  const run = (sql, params) => client.query(sql, params);
  const apply = async (files) => {
    for (const file of files) await run(fs.readFileSync(path.join(dir, file), 'utf8'));
  };

  before(async () => {
    client = new pg.Client({ connectionString: url });
    await client.connect();
    const { rows } = await run(`SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_name LIKE '${P}%'`);
    assert.equal(rows[0].n, 0, 'TEST_DATABASE_URL must point at an empty database');
  });

  after(async () => client?.end());

  test('the admins that exist before roles become super_admin; re-running never promotes later admins', async () => {
    const roles = FILES.indexOf('011_admin_roles_single_org.sql');
    await apply(FILES.slice(0, roles));
    await run(`INSERT INTO ${P}admins (username, password_hash, name) VALUES ('legacy', 'x', 'Legacy Admin')`);
    await apply(FILES.slice(roles));
    let rows = (await run(`SELECT username, role, status FROM ${P}admins`)).rows;
    assert.deepEqual(rows, [{ username: 'legacy', role: 'super_admin', status: 'active' }]);

    await run(`INSERT INTO ${P}admins (username, password_hash, name, role) VALUES ('later', 'x', 'Later', 'reception')`);
    await apply(FILES);
    rows = (await run(`SELECT username, role FROM ${P}admins ORDER BY id`)).rows;
    assert.deepEqual(rows, [{ username: 'legacy', role: 'super_admin' }, { username: 'later', role: 'reception' }]);
  });

  test('roles and statuses outside the allowed lists are refused', async () => {
    await assert.rejects(run(`INSERT INTO ${P}admins (username, password_hash, name, role) VALUES ('bad', 'x', 'Bad', 'host')`));
    await assert.rejects(run(`UPDATE ${P}admins SET status = 'disabled' WHERE username = 'legacy'`));
  });

  test('deleting an account leaves its knowledge rows intact; new rows need no account', async () => {
    const account = (
      await run(`INSERT INTO ${P}accounts (name, username, password_hash) VALUES ('Old Portal', 'oldportal', 'x') RETURNING id`)
    ).rows[0];
    await run(`INSERT INTO ${P}knowledge_base (account_id, kind, title, answer) VALUES ($1, 'document', 'Company profile', 'We build fibre.')`, [account.id]);
    await run(`INSERT INTO ${P}knowledge_base (account_id, kind, title, answer) VALUES (NULL, 'qa', 'Parking', 'Gate 2.')`);
    await run(`DELETE FROM ${P}accounts WHERE id = $1`, [account.id]);
    const rows = (await run(`SELECT title, account_id FROM ${P}knowledge_base ORDER BY id`)).rows;
    assert.deepEqual(rows.map((r) => r.title), ['Company profile', 'Parking']);
    const fks = (await run(`SELECT COUNT(*)::int AS n FROM pg_constraint WHERE conrelid = '${P}knowledge_base'::regclass AND contype = 'f'`)).rows[0].n;
    assert.equal(fks, 0);
  });
});
