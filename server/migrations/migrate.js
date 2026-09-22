import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { pool } = await import('../src/config/db.js');

const sql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');

try {
  await pool.query(sql);
  console.log('Prefixed VMS tables are ready (existing tables were not modified).');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
