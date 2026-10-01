// Password changes for admins and portal accounts. Every change stamps password_changed_at,
// which ends all other sessions of that login (see requireAuth). Passwords are never logged.
import bcrypt from 'bcryptjs';
import { Account, Admin, Audit } from '../models/index.js';
import { adminToken, hostToken } from './authController.js';

export const MIN_PASSWORD = 10;
// bcrypt only uses the first 72 bytes of a password.
const MAX_PASSWORD = 72;

function passwordProblem(password, confirm) {
  if (password.length < MIN_PASSWORD) return `The new password must be at least ${MIN_PASSWORD} characters.`;
  if (Buffer.byteLength(password) > MAX_PASSWORD) return `The new password must be at most ${MAX_PASSWORD} characters.`;
  if (confirm !== undefined && confirm !== password) return 'The new password and its confirmation do not match.';
  return null;
}

// Shared by the admin and portal "change my own password" forms.
async function changeOwn(req, res, { row, setPassword, issueToken, actor, label }) {
  const current = String(req.body.currentPassword || '');
  const next = String(req.body.newPassword || '');
  const confirm = req.body.confirmPassword === undefined ? undefined : String(req.body.confirmPassword);
  if (!(await bcrypt.compare(current, row.password_hash))) {
    return res.status(400).json({ error: 'Your current password is incorrect.' });
  }
  const problem = passwordProblem(next, confirm);
  if (problem) return res.status(400).json({ error: problem });
  if (await bcrypt.compare(next, row.password_hash)) {
    return res.status(400).json({ error: 'The new password must be different from the current one.' });
  }
  const updated = await setPassword(row.id, await bcrypt.hash(next, 10));
  await Audit.add({ actor, action: 'Changed own password', details: label });
  // A fresh token keeps this session signed in; every other session of this login ends.
  res.json({ ok: true, token: issueToken(updated) });
}

export async function changeAdminPassword(req, res) {
  const admin = req.principal;
  return changeOwn(req, res, {
    row: admin,
    setPassword: Admin.setPassword,
    issueToken: (updated) => adminToken(updated),
    actor: admin.name || admin.username,
    label: `admin ${admin.username}`,
  });
}

// A portal user can only ever change the account they are signed in as: the id comes from the
// session, never from the request.
export async function changeOwnAccountPassword(req, res) {
  const account = req.principal;
  return changeOwn(req, res, {
    row: account,
    setPassword: Account.setPassword,
    issueToken: (updated) => hostToken(updated, req.user.hostId),
    actor: account.name || account.username,
    label: `portal account ${account.username}`,
  });
}

export async function resetAccountPassword(req, res) {
  const account = await Account.findById(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  const next = String(req.body.newPassword || '');
  const confirm = req.body.confirmPassword === undefined ? undefined : String(req.body.confirmPassword);
  const problem = passwordProblem(next, confirm);
  if (problem) return res.status(400).json({ error: problem });
  await Account.setPassword(account.id, await bcrypt.hash(next, 10));
  await Audit.add({
    actor: req.principal?.name || req.user?.username || 'Admin',
    action: 'Reset account password',
    details: `${account.username} (${account.name})`,
  });
  res.json({ ok: true });
}

// The signed-in login, read from the database (used for the admin sidebar).
export function me(req, res) {
  const p = req.principal;
  res.json({ role: req.user.role, name: p.name || p.username, username: p.username });
}
