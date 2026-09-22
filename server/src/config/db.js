import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { Pool, types } = pg;

// Keep DATE/TIME as strings so they are not shifted by the local timezone.
types.setTypeParser(1082, (value) => value);
types.setTypeParser(1083, (value) => (value || '').slice(0, 5));

function buildDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const user = encodeURIComponent(process.env.SUPABASE_DB_USER || 'postgres');
  const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD || '');
  const host = process.env.SUPABASE_DB_HOST;
  const port = process.env.SUPABASE_DB_PORT || '6543';
  const name = process.env.SUPABASE_DB_NAME || 'postgres';
  if (!host) throw new Error('DATABASE_URL or SUPABASE_DB_HOST is required');
  return `postgresql://${user}:${password}@${host}:${port}/${name}?sslmode=require`;
}

export const pool = new Pool({
  connectionString: buildDatabaseUrl().replace(/[?&]sslmode=[^&]*/g, ''),
  ssl: { rejectUnauthorized: false },
  max: 10,
});

export async function query(text, params = []) {
  const result = await pool.query(text, params);
  return result.rows;
}

export async function queryOne(text, params = []) {
  const rows = await query(text, params);
  return rows[0] || null;
}
