import jwt from 'jsonwebtoken';
import { Admin } from '../models/index.js';
import { passwordStamp } from '../utils/jwt.js';

// Admin panel roles, from most to least access.
export const ROLES = ['super_admin', 'admin', 'reception'];
export const ANY_ROLE = ROLES;
export const STAFF = ['super_admin', 'admin'];
export const SUPER_ADMIN = ['super_admin'];

// Checks the token, then the login behind it on every request: it must still exist, be active,
// hold one of the allowed roles, and its password must not have changed since the token was
// issued. The role comes from the database, so blocking, deleting, a role change or a password
// change takes effect immediately.
export function requireAuth(...roles) {
  const allowed = roles.flat();
  return async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    if (!payload.adminId) return res.status(401).json({ error: 'Your session has ended. Please sign in again.' });
    let admin;
    try {
      admin = await Admin.findById(payload.adminId);
    } catch (err) {
      return next(err);
    }
    if (!admin) return res.status(401).json({ error: 'Your session has ended. Please sign in again.' });
    if ((admin.status || 'active') !== 'active') {
      return res.status(401).json({ error: 'This account has been blocked. Contact your administrator.' });
    }
    if ((payload.pwc || 0) !== passwordStamp(admin)) {
      return res.status(401).json({ error: 'Your password was changed. Please sign in again.' });
    }
    const role = ROLES.includes(admin.role) ? admin.role : 'admin';
    if (allowed.length && !allowed.includes(role)) return res.status(403).json({ error: 'Forbidden' });
    req.user = { adminId: admin.id, role, name: admin.name, username: admin.username };
    req.principal = admin;
    next();
  };
}

// Sliding-window limiter. Each limiter keeps its own counters, so one route cannot use up
// another's budget. Keys use req.ip, which is the real client IP once trust proxy is set.
export function rateLimit({ windowMs = 15 * 60 * 1000, max = 30, key = (req) => req.ip || 'unknown', message } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const id = key(req);
    const now = Date.now();
    const recent = (hits.get(id) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(id, recent);
      return res.status(429).json({ error: message || 'Too many requests. Please wait and try again.' });
    }
    recent.push(now);
    hits.set(id, recent);
    if (hits.size > 10000) {
      for (const [k, times] of hits) if (!times.some((t) => now - t < windowMs)) hits.delete(k);
    }
    next();
  };
}

// 10 sign-in attempts per 15 minutes for each IP + username pair.
export function loginRateLimit() {
  return rateLimit({
    max: 10,
    key: (req) => `${req.ip || 'unknown'}|${String(req.body?.username || '').trim().toLowerCase()}`,
    message: 'Too many sign-in attempts. Please wait 15 minutes and try again.',
  });
}
