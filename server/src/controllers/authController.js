import bcrypt from 'bcryptjs';
import { Admin } from '../models/index.js';
import { passwordStamp, signToken } from '../utils/jwt.js';

// The token only identifies the login; role and status are read from the database on every request.
export function adminToken(admin) {
  return signToken({ role: 'admin', username: admin.username, name: admin.name, adminId: admin.id, pwc: passwordStamp(admin) });
}

export async function adminLogin(req, res) {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const admin = await Admin.findByUsername(username);
  if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }
  if ((admin.status || 'active') !== 'active') {
    return res.status(403).json({ error: 'This account has been blocked. Contact your administrator.' });
  }
  res.json({
    token: adminToken(admin),
    admin: { name: admin.name, username: admin.username, role: admin.role || 'admin' },
  });
}
