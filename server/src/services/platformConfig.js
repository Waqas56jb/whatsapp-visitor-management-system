// Platform configuration set by the super admin: default chat language, sign-in security and
// backup policy. Read through a short cache so every request does not hit the database.
import { PlatformSettings } from '../models/index.js';

export const PLATFORM_DEFAULTS = {
  platformName: 'Botho VMS',
  supportEmail: '',
  defaultLanguage: 'en',
  defaultPlan: 'starter',
  passwordMinLength: 10,
  sessionHours: 12,
  loginAttemptsPer15Min: 10,
  impersonationMinutes: 60,
  backupRetentionDays: 7,
  maintenanceMode: false,
};

let cache = { at: 0, value: { ...PLATFORM_DEFAULTS } };

export async function platformConfig(force = false) {
  if (!force && Date.now() - cache.at < 30_000) return cache.value;
  try {
    const stored = await PlatformSettings.get();
    const { audit_backfilled, ...rest } = stored || {};
    cache = { at: Date.now(), value: { ...PLATFORM_DEFAULTS, ...rest } };
  } catch (err) {
    console.error('Platform settings read failed:', err.message);
    cache.at = Date.now();
  }
  return cache.value;
}

// Last value read (never waits): for sync callers such as the sign-in rate limiter.
export function cachedPlatformConfig() {
  return cache.value;
}

export function clean(patch = {}) {
  const out = {};
  const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
  const int = (v, min, max) => Math.min(max, Math.max(min, Math.round(Number(v)) || min));
  if (patch.platformName !== undefined) out.platformName = str(patch.platformName, 80) || PLATFORM_DEFAULTS.platformName;
  if (patch.supportEmail !== undefined) out.supportEmail = str(patch.supportEmail, 160);
  if (patch.defaultLanguage !== undefined) out.defaultLanguage = patch.defaultLanguage === 'tn' ? 'tn' : 'en';
  if (patch.defaultPlan !== undefined) out.defaultPlan = ['starter', 'business', 'enterprise'].includes(patch.defaultPlan) ? patch.defaultPlan : 'starter';
  if (patch.passwordMinLength !== undefined) out.passwordMinLength = int(patch.passwordMinLength, 8, 32);
  if (patch.sessionHours !== undefined) out.sessionHours = int(patch.sessionHours, 1, 72);
  if (patch.loginAttemptsPer15Min !== undefined) out.loginAttemptsPer15Min = int(patch.loginAttemptsPer15Min, 3, 50);
  if (patch.impersonationMinutes !== undefined) out.impersonationMinutes = int(patch.impersonationMinutes, 5, 240);
  if (patch.backupRetentionDays !== undefined) out.backupRetentionDays = int(patch.backupRetentionDays, 1, 90);
  if (patch.maintenanceMode !== undefined) out.maintenanceMode = Boolean(patch.maintenanceMode);
  return out;
}

export async function savePlatformConfig(patch) {
  await PlatformSettings.merge(clean(patch));
  return platformConfig(true);
}
