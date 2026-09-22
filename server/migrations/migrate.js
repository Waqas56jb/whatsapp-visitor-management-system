import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { pool } = await import('../src/config/db.js');

const files = [
  'init.sql',
  '002_whatsapp.sql',
  '003_remove_pin.sql',
  '004_conversation_log.sql',
  '005_add_blocked_status.sql',
  '006_client_whatsapp.sql',
  '007_restore_pin.sql',
];

try {
  for (const file of files) {
    const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
    await pool.query(sql);
    console.log(`Applied ${file}`);
  }
  console.log('Prefixed VMS tables are ready (existing tables were not dropped).');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
