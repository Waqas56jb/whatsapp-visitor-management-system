import fs from 'fs';
import path from 'path';
import { CompanyWhatsApp } from '../models/index.js';

export async function restoreAuthDir(dir) {
  const row = await CompanyWhatsApp.get();
  const files = row?.keys;
  if (!files || typeof files !== 'object' || !files['creds.json']) return false;
  await fs.promises.mkdir(dir, { recursive: true });
  for (const [name, raw] of Object.entries(files)) {
    if (!name.endsWith('.json') || typeof raw !== 'string') continue;
    await fs.promises.writeFile(path.join(dir, name), raw, 'utf8');
  }
  return true;
}

export async function snapshotAuthDir(dir) {
  if (!fs.existsSync(dir)) return;
  const names = await fs.promises.readdir(dir);
  const files = {};
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    files[name] = await fs.promises.readFile(path.join(dir, name), 'utf8');
  }
  if (!files['creds.json']) return;
  await CompanyWhatsApp.saveAuth({ creds: { stored: true }, keys: files });
}

export async function clearAuthDir(dir) {
  await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
}

export function hasSavedCreds(dir) {
  try {
    const raw = fs.readFileSync(path.join(dir, 'creds.json'), 'utf8');
    const creds = JSON.parse(raw);
    return Boolean(creds?.me?.id || creds?.me?.name);
  } catch {
    return false;
  }
}
