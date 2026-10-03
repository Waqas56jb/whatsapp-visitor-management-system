import jwt from 'jsonwebtoken';
import { Admin, Company } from '../models/index.js';
import { can, isPlatformRole, PERMISSIONS, ROLES } from '../config/permissions.js';
import { effectiveFeatures } from '../config/plans.js';
import { runWithTenant } from '../tenant.js';
import { cachedPlatformConfig } from '../services/platformConfig.js';
import { passwordStamp } from '../utils/jwt.js';

export { ROLES };

const COMPANY_CLOSED = {
  suspended: 'This company account is suspended. Contact the platform administrator.',
  terminated: 'This company account has been terminated.',
};

// Checks the token, then the login behind it on every request: it must still exist, be active,
// and its password must not have changed since the token was issued. Role and company come from
// the database, so blocking, deleting, a role change or a password change take effect at once.
//
// Company users (and platform staff impersonating a company) run the rest of the request inside
// that company's context: every company query is filtered to it. A suspended or terminated
// company is refused for its own users; platform staff may still impersonate it to help.
export function requireAuth() {
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
    if (!ROLES.includes(admin.role)) return res.status(403).json({ error: 'This account has no role. Contact your administrator.' });

    const platform = isPlatformRole(admin.role);
    let companyId = null;
    let role = admin.role;
    let impersonating = null;

    if (platform && payload.imp) {
      // A platform user working inside a company as its company admin ("log in as").
      if (!can(admin.role, 'platform.impersonate')) return res.status(403).json({ error: 'Forbidden' });
      companyId = Number(payload.imp);
      role = 'company_admin';
      impersonating = { by: admin.username, byRole: admin.role };
    } else if (!platform) {
      companyId = Number(admin.company_id);
    }

    let company = null;
    if (companyId) {
      try {
        company = await Company.findById(companyId);
      } catch (err) {
        return next(err);
      }
      if (!company) return res.status(401).json({ error: 'This company no longer exists.' });
      if (!impersonating && company.status !== 'active') {
        return res.status(403).json({ error: COMPANY_CLOSED[company.status] || 'This company is not active.', code: 'company_' + company.status });
      }
      if (!impersonating && cachedPlatformConfig().maintenanceMode) {
        return res.status(503).json({ error: 'The platform is under maintenance. Please try again shortly.', code: 'maintenance' });
      }
    }

    req.user = {
      adminId: admin.id,
      role,
      realRole: admin.role,
      name: admin.name,
      username: admin.username,
      companyId,
      impersonating,
    };
    req.principal = admin;
    req.company = company;
    if (companyId) return runWithTenant(companyId, () => next());
    next();
  };
}

// The signed-in user (after requireAuth) must hold this permission.
export function requirePermission(permission) {
  if (!PERMISSIONS[permission]) throw new Error(`Unknown permission ${permission}`);
  return (req, res, next) => {
    if (!req.user || !can(req.user.role, permission)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

// The company's plan (with overrides) must include this feature.
export function requireFeature(feature) {
  return (req, res, next) => {
    if (!req.company || !effectiveFeatures(req.company)[feature]) {
      return res.status(403).json({ error: 'This feature is not included in your plan.', code: 'feature_locked', feature });
    }
    next();
  };
}

// Display name for the audit trail; shows who really acted while impersonating.
export function actorName(req) {
  const name = req.user?.name || req.user?.username || 'Staff';
  return req.user?.impersonating ? `${name} (platform ${req.user.impersonating.byRole} as company admin)` : name;
}

// Sliding-window limiter. Each limiter keeps its own counters, so one route cannot use up
// another's budget. Keys use req.ip, which is the real client IP once trust proxy is set.
export function rateLimit({ windowMs = 15 * 60 * 1000, max = 30, key = (req) => req.ip || 'unknown', message } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const limit = typeof max === 'function' ? max() : max;
    const id = key(req);
    const now = Date.now();
    const recent = (hits.get(id) || []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
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

// Sign-in attempts per 15 minutes for each IP + username pair (platform setting, default 10).
export function loginRateLimit(getMax = () => 10) {
  return rateLimit({
    max: getMax,
    key: (req) => `${req.ip || 'unknown'}|${String(req.body?.username || '').trim().toLowerCase()}`,
    message: 'Too many sign-in attempts. Please wait 15 minutes and try again.',
  });
}
