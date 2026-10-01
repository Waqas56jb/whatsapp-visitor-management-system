import jwt from 'jsonwebtoken';
import { Account, Admin } from '../models/index.js';
import { passwordStamp } from '../utils/jwt.js';

function loadPrincipal(payload) {
  if (payload.role === 'admin') return payload.adminId ? Admin.findById(payload.adminId) : null;
  if (payload.role === 'host') return payload.accountId ? Account.findById(payload.accountId) : null;
  return null;
}

// Checks the token, then the login behind it on every request: it must still exist, a portal
// account must still be active, and the password must not have changed since the token was
// issued. Blocking, deleting, or changing a password therefore ends sessions immediately.
export function requireAuth(...roles) {
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
    if (roles.length && !roles.includes(payload.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    let principal;
    try {
      principal = await loadPrincipal(payload);
    } catch (err) {
      return next(err);
    }
    if (!principal) return res.status(401).json({ error: 'Your session has ended. Please sign in again.' });
    if (payload.role === 'host' && principal.status !== 'active') {
      return res.status(401).json({ error: 'This account is no longer active. Contact your administrator.' });
    }
    if ((payload.pwc || 0) !== passwordStamp(principal)) {
      return res.status(401).json({ error: 'Your password was changed. Please sign in again.' });
    }
    req.user = payload;
    req.principal = principal;
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
