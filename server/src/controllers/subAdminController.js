// Sub-admins: the panel logins a super_admin manages. Nobody can lock themselves out, and the
// last active super_admin can never be blocked, demoted or deleted.
import bcrypt from 'bcryptjs';
import { Admin, Audit } from '../models/index.js';
import { ROLES } from '../middleware/auth.js';
import { formatDateNice } from '../utils/mappers.js';
import { passwordProblem } from './passwordController.js';

function mapAdmin(row) {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: ROLES.includes(row.role) ? row.role : 'admin',
    status: row.status || 'active',
    created: formatDateNice(row.created_at),
  };
}

function actor(req) {
  return req.user?.name || req.user?.username || 'Super admin';
}

async function loadTarget(req, res) {
  const target = await Admin.findById(req.params.id);
  if (!target) {
    res.status(404).json({ error: 'Sub-admin not found' });
    return null;
  }
  return target;
}

function isSelf(req, target) {
  return Number(target.id) === Number(req.user.adminId);
}

// True when this change would leave the organisation without an active super_admin.
async function removesLastSuperAdmin(target) {
  if (target.role !== 'super_admin' || (target.status || 'active') !== 'active') return false;
  return (await Admin.countActiveSuperAdmins()) <= 1;
}

export async function listAdmins(req, res) {
  res.json((await Admin.list()).map(mapAdmin));
}

export async function createAdmin(req, res) {
  const name = String(req.body.name || '').trim();
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const role = String(req.body.role || '');
  if (!name || !username || !password) return res.status(400).json({ error: 'Please fill in every field' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Choose a role: super_admin, admin or reception' });
  const problem = passwordProblem(password, req.body.confirmPassword === undefined ? undefined : String(req.body.confirmPassword));
  if (problem) return res.status(400).json({ error: problem.replace('The new password', 'The password') });
  if (await Admin.findByUsername(username)) return res.status(409).json({ error: 'That username is already taken' });
  const row = await Admin.create({ username, password_hash: await bcrypt.hash(password, 10), name, role });
  await Audit.add({ actor: actor(req), action: 'Created sub-admin', details: `${username} (${role})` });
  res.status(201).json(mapAdmin(row));
}

export async function changeAdminRole(req, res) {
  const target = await loadTarget(req, res);
  if (!target) return;
  const role = String(req.body.role || '');
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Choose a role: super_admin, admin or reception' });
  if (isSelf(req, target)) return res.status(400).json({ error: 'You cannot change your own role.' });
  if (role !== 'super_admin' && (await removesLastSuperAdmin(target))) {
    return res.status(400).json({ error: 'There must always be at least one active super admin.' });
  }
  const row = await Admin.setRole(target.id, role);
  await Audit.add({ actor: actor(req), action: 'Changed sub-admin role', details: `${target.username} → ${role}` });
  res.json(mapAdmin(row));
}

export async function blockAdmin(req, res) {
  const target = await loadTarget(req, res);
  if (!target) return;
  if (isSelf(req, target)) return res.status(400).json({ error: 'You cannot block your own account.' });
  if (await removesLastSuperAdmin(target)) return res.status(400).json({ error: 'There must always be at least one active super admin.' });
  const row = await Admin.setStatus(target.id, 'blocked');
  await Audit.add({ actor: actor(req), action: 'Blocked sub-admin', details: `${target.username} (${target.name})` });
  res.json(mapAdmin(row));
}

export async function unblockAdmin(req, res) {
  const target = await loadTarget(req, res);
  if (!target) return;
  const row = await Admin.setStatus(target.id, 'active');
  await Audit.add({ actor: actor(req), action: 'Unblocked sub-admin', details: `${target.username} (${target.name})` });
  res.json(mapAdmin(row));
}

export async function deleteAdmin(req, res) {
  if (req.body?.confirm !== true) return res.status(400).json({ error: 'Confirmation required' });
  const target = await loadTarget(req, res);
  if (!target) return;
  if (isSelf(req, target)) return res.status(400).json({ error: 'You cannot delete your own account.' });
  if (await removesLastSuperAdmin(target)) return res.status(400).json({ error: 'There must always be at least one active super admin.' });
  await Admin.remove(target.id);
  await Audit.add({ actor: actor(req), action: 'Deleted sub-admin', details: `${target.username} (${target.name}, ${target.role})` });
  res.json({ ok: true });
}

export async function resetAdminPassword(req, res) {
  const target = await loadTarget(req, res);
  if (!target) return;
  const next = String(req.body.newPassword || '');
  const confirm = req.body.confirmPassword === undefined ? undefined : String(req.body.confirmPassword);
  const problem = passwordProblem(next, confirm);
  if (problem) return res.status(400).json({ error: problem });
  await Admin.setPassword(target.id, await bcrypt.hash(next, 10));
  await Audit.add({ actor: actor(req), action: 'Reset sub-admin password', details: `${target.username} (${target.name})` });
  res.json({ ok: true });
}
