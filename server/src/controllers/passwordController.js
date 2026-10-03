// Changing your own password and profile. Every password change stamps password_changed_at,
// which ends all other sessions of that login (see requireAuth). Passwords are never logged.
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Admin, Audit } from '../models/index.js';
import { cachedPlatformConfig } from '../services/platformConfig.js';
import { adminToken } from './authController.js';

// bcrypt only uses the first 72 bytes of a password.
const MAX_PASSWORD = 72;

export function minPassword() {
  return Number(cachedPlatformConfig().passwordMinLength) || 10;
}

export function passwordProblem(password, confirm) {
  const min = minPassword();
  if (password.length < min) return `The new password must be at least ${min} characters.`;
  if (Buffer.byteLength(password) > MAX_PASSWORD) return `The new password must be at most ${MAX_PASSWORD} characters.`;
  if (confirm !== undefined && confirm !== password) return 'The new password and its confirmation do not match.';
  return null;
}

// A random password that meets the policy, shown once to whoever creates a login.
export function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const length = Math.max(14, minPassword());
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[crypto.randomInt(alphabet.length)];
  return `${out.slice(0, 5)}-${out.slice(5, 10)}-${out.slice(10)}`;
}

function actor(req) {
  return req.user.impersonating ? `${req.user.name} (platform)` : req.user.name || req.user.username;
}

async function auditSelf(req, action) {
  const entry = { actor: actor(req), action, details: req.principal.username };
  if (req.user.companyId && !req.user.impersonating) await Audit.add(entry);
  else await Audit.platform(entry);
}

export async function changeOwnPassword(req, res) {
  if (req.user.impersonating) return res.status(400).json({ error: 'You cannot change a password while signed in as a company.' });
  const admin = req.principal;
  const current = String(req.body.currentPassword || '');
  const next = String(req.body.newPassword || '');
  const confirm = req.body.confirmPassword === undefined ? undefined : String(req.body.confirmPassword);
  if (!(await bcrypt.compare(current, admin.password_hash))) return res.status(400).json({ error: 'Your current password is incorrect.' });
  const problem = passwordProblem(next, confirm);
  if (problem) return res.status(400).json({ error: problem });
  if (await bcrypt.compare(next, admin.password_hash)) {
    return res.status(400).json({ error: 'The new password must be different from the current one.' });
  }
  const updated = await Admin.setPassword(admin.id, await bcrypt.hash(next, 10));
  await auditSelf(req, 'Changed own password');
  // A fresh token keeps this session signed in; every other session of this login ends.
  res.json({ ok: true, token: await adminToken(updated) });
}

export async function updateOwnProfile(req, res) {
  if (req.user.impersonating) return res.status(400).json({ error: 'You cannot change this profile while signed in as a company.' });
  const name = req.body.name === undefined ? undefined : String(req.body.name).trim().slice(0, 80);
  const email = req.body.email === undefined ? undefined : String(req.body.email).trim().slice(0, 160);
  if (name !== undefined && !name) return res.status(400).json({ error: 'Your name cannot be empty.' });
  if (email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  const row = await Admin.update(req.principal.id, { name, email });
  await auditSelf(req, 'Updated own profile');
  res.json({ name: row.name, email: row.email });
}
