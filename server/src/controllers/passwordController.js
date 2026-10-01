// Changing your own password, and who you are. Every change stamps password_changed_at, which
// ends all other sessions of that login (see requireAuth). Passwords are never logged.
import bcrypt from 'bcryptjs';
import { Admin, Audit } from '../models/index.js';
import { adminToken } from './authController.js';

export const MIN_PASSWORD = 10;
// bcrypt only uses the first 72 bytes of a password.
const MAX_PASSWORD = 72;

export function passwordProblem(password, confirm) {
  if (password.length < MIN_PASSWORD) return `The new password must be at least ${MIN_PASSWORD} characters.`;
  if (Buffer.byteLength(password) > MAX_PASSWORD) return `The new password must be at most ${MAX_PASSWORD} characters.`;
  if (confirm !== undefined && confirm !== password) return 'The new password and its confirmation do not match.';
  return null;
}

export async function changeOwnPassword(req, res) {
  const admin = req.principal;
  const current = String(req.body.currentPassword || '');
  const next = String(req.body.newPassword || '');
  const confirm = req.body.confirmPassword === undefined ? undefined : String(req.body.confirmPassword);
  if (!(await bcrypt.compare(current, admin.password_hash))) {
    return res.status(400).json({ error: 'Your current password is incorrect.' });
  }
  const problem = passwordProblem(next, confirm);
  if (problem) return res.status(400).json({ error: problem });
  if (await bcrypt.compare(next, admin.password_hash)) {
    return res.status(400).json({ error: 'The new password must be different from the current one.' });
  }
  const updated = await Admin.setPassword(admin.id, await bcrypt.hash(next, 10));
  await Audit.add({ actor: admin.name || admin.username, action: 'Changed own password', details: `${admin.username}` });
  // A fresh token keeps this session signed in; every other session of this login ends.
  res.json({ ok: true, token: adminToken(updated) });
}

// The signed-in login, read from the database (sidebar, and which pages to show).
export function me(req, res) {
  const p = req.principal;
  res.json({ name: p.name || p.username, username: p.username, role: req.user.role });
}
