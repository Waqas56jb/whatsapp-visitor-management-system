// Panel logins, shared by the platform team page and each company's staff page. Nobody can lock
// themselves out, and the last active super admin (platform) or company admin (company) can never
// be blocked, demoted or deleted.
import bcrypt from 'bcryptjs';
import { Admin } from '../models/index.js';
import { COMPANY_ROLES, PLATFORM_ROLES, ROLE_LABELS } from '../config/permissions.js';
import { formatDateNice } from '../utils/mappers.js';
import { generatePassword, passwordProblem } from '../controllers/passwordController.js';

export function mapLogin(row) {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email || '',
    role: row.role,
    roleLabel: ROLE_LABELS[row.role] || row.role,
    status: row.status || 'active',
    created: formatDateNice(row.created_at),
  };
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// scope: null for the platform team, or a company id.
export function loginScope(companyId) {
  const platform = !companyId;
  const roles = platform ? PLATFORM_ROLES : COMPANY_ROLES;
  const guardRole = platform ? 'super_admin' : 'company_admin';
  const countGuard = () => (platform ? Admin.countActiveSuperAdmins() : Admin.countActiveCompanyAdmins(companyId));

  async function load(id) {
    const row = await Admin.findById(id);
    const inScope = row && (platform ? row.company_id == null : Number(row.company_id) === Number(companyId));
    if (!inScope) throw httpError(404, 'Login not found');
    return row;
  }

  async function removesLastGuard(target) {
    if (target.role !== guardRole || (target.status || 'active') !== 'active') return false;
    return (await countGuard()) <= 1;
  }

  return {
    roles,
    list: async () => (platform ? Admin.listPlatform() : Admin.listCompany(companyId)).then((rows) => rows.map(mapLogin)),

    // Creates a login. Without a password one is generated and returned once.
    async create({ name, username, email = '', role, password, confirmPassword }) {
      name = String(name || '').trim();
      username = String(username || '').trim();
      if (!name || !username) throw httpError(400, 'Please fill in name and username');
      if (!/^[a-zA-Z0-9._@-]{3,60}$/.test(username)) throw httpError(400, 'Usernames use 3–60 letters, numbers, dots, dashes or @.');
      if (!roles.includes(role)) throw httpError(400, `Choose a role: ${roles.map((r) => ROLE_LABELS[r]).join(', ')}`);
      if (email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) throw httpError(400, 'Please enter a valid email address.');
      let plain = password ? String(password) : '';
      if (plain) {
        const problem = passwordProblem(plain, confirmPassword === undefined ? undefined : String(confirmPassword));
        if (problem) throw httpError(400, problem.replace('The new password', 'The password'));
      } else {
        plain = generatePassword();
      }
      if (await Admin.findByUsername(username)) throw httpError(409, 'That username is already taken');
      const row = await Admin.create({
        username,
        password_hash: await bcrypt.hash(plain, 10),
        name,
        role,
        company_id: platform ? null : Number(companyId),
        email: String(email || '').trim(),
      });
      return { login: mapLogin(row), password: password ? null : plain };
    },

    async setRole(actorId, id, role) {
      const target = await load(id);
      if (!roles.includes(role)) throw httpError(400, 'Choose a valid role');
      if (Number(target.id) === Number(actorId)) throw httpError(400, 'You cannot change your own role.');
      if (role !== guardRole && (await removesLastGuard(target))) throw httpError(400, `There must always be at least one active ${ROLE_LABELS[guardRole].toLowerCase()}.`);
      return { target, login: mapLogin(await Admin.setRole(target.id, role)) };
    },

    async setStatus(actorId, id, status) {
      const target = await load(id);
      if (status === 'blocked') {
        if (Number(target.id) === Number(actorId)) throw httpError(400, 'You cannot block your own account.');
        if (await removesLastGuard(target)) throw httpError(400, `There must always be at least one active ${ROLE_LABELS[guardRole].toLowerCase()}.`);
      }
      return { target, login: mapLogin(await Admin.setStatus(target.id, status)) };
    },

    async remove(actorId, id) {
      const target = await load(id);
      if (Number(target.id) === Number(actorId)) throw httpError(400, 'You cannot delete your own account.');
      if (await removesLastGuard(target)) throw httpError(400, `There must always be at least one active ${ROLE_LABELS[guardRole].toLowerCase()}.`);
      await Admin.remove(target.id);
      return { target };
    },

    // Sets a new password (given, or generated and returned once). Ends the login's sessions.
    async resetPassword(id, { newPassword, confirmPassword } = {}) {
      const target = await load(id);
      let plain = newPassword ? String(newPassword) : '';
      if (plain) {
        const problem = passwordProblem(plain, confirmPassword === undefined ? undefined : String(confirmPassword));
        if (problem) throw httpError(400, problem);
      } else plain = generatePassword();
      await Admin.setPassword(target.id, await bcrypt.hash(plain, 10));
      return { target, password: newPassword ? null : plain };
    },

    async update(id, { name, email }) {
      const target = await load(id);
      if (email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) throw httpError(400, 'Please enter a valid email address.');
      return { target, login: mapLogin(await Admin.update(target.id, { name: name === undefined ? undefined : String(name).trim(), email })) };
    },
  };
}
