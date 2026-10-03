// Scratch databases for integration tests, on the throwaway server named by TEST_DATABASE_URL.
// Each test file gets its own database, created empty and dropped afterwards.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

// The same files, in the same order, as `npm run migrate`.
export const MIGRATIONS = [...fs.readFileSync(path.join(dir, 'migrate.js'), 'utf8').matchAll(/'([\w.]+\.sql)'/g)].map((m) => m[1]);

export function migrationSql(file) {
  return fs.readFileSync(path.join(dir, file), 'utf8');
}

function adminUrl() {
  return process.env.TEST_DATABASE_URL;
}

export async function createScratchDatabase(label) {
  const name = `vms_test_${label}_${crypto.randomBytes(4).toString('hex')}`;
  const admin = new pg.Client({ connectionString: adminUrl() });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const url = new URL(adminUrl());
  url.pathname = `/${name}`;
  return { name, url: url.toString() };
}

export async function migrate(url) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  for (const file of MIGRATIONS) await client.query(migrationSql(file));
  await client.end();
}

export async function dropScratchDatabase(name) {
  const admin = new pg.Client({ connectionString: adminUrl() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
}
