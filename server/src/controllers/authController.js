import bcrypt from 'bcryptjs';
import { Account, Admin, Host } from '../models/index.js';
import { signToken } from '../utils/jwt.js';

export async function adminLogin(req, res) {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const admin = await Admin.findByUsername(username);
  if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }
  const token = signToken({ role: 'admin', username: admin.username, name: admin.name, adminId: admin.id });
  res.json({ token, admin: { name: admin.name, username: admin.username } });
}

export async function clientLogin(req, res) {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const account = await Account.findByUsername(username);
  if (!account || !(await bcrypt.compare(password, account.password_hash))) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }
  if (account.status === 'blocked') {
    return res.status(403).json({ error: 'This account has been blocked. Contact your administrator.' });
  }
  if (account.status !== 'active') {
    return res.status(403).json({ error: 'This account has been disabled. Contact your administrator.' });
  }
  const host = (await Host.findByAccountId(account.id)) || (await Host.findByName(account.name));
  const token = signToken({
    role: 'host',
    accountId: account.id,
    hostId: host?.id || null,
    name: account.name,
    username: account.username,
  });
  res.json({
    token,
    host: {
      id: account.id,
      name: account.name,
      username: account.username,
      role: account.role,
      status: account.status,
      department: host?.department || '—',
      hostId: host?.id || null,
    },
  });
}
