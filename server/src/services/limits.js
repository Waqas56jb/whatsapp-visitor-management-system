// Plan limits for the current company. null = unlimited.
import { queryOne } from '../config/db.js';
import { T } from '../config/tables.js';
import { effectiveLimits, LIMITS } from '../config/plans.js';
import { Admin, Company, Host, Knowledge, Visit } from '../models/index.js';
import { tenantId } from '../tenant.js';
import { todayStamp } from '../utils/dateParse.js';

export function monthStart(today = todayStamp()) {
  return `${today.slice(0, 7)}-01`;
}

async function storageBytes(companyId) {
  const row = await queryOne(
    `SELECT
       (SELECT COALESCE(SUM(size_bytes), 0) FROM ${T.documents} WHERE company_id = $1)::bigint AS docs,
       (SELECT COALESCE(SUM(octet_length(answer) + octet_length(COALESCE(question, ''))), 0) FROM ${T.knowledge} WHERE company_id = $1)::bigint AS kb`,
    [companyId]
  );
  return Number(row?.docs || 0) + Number(row?.kb || 0);
}

export async function usageFor(limit, companyId = tenantId()) {
  switch (limit) {
    case 'hosts':
      return Host.count();
    case 'staff':
      return Admin.countCompany(companyId);
    case 'visits_per_month':
      return Visit.countThisMonth(monthStart());
    case 'messages_per_month': {
      const row = await queryOne(
        `SELECT COUNT(*)::int AS n FROM ${T.conversationLog} WHERE company_id = $1 AND created_at >= $2::date`,
        [companyId, monthStart()]
      );
      return Number(row?.n || 0);
    }
    case 'knowledge_entries':
      return Knowledge.count();
    case 'storage_mb':
      return Math.round(((await storageBytes(companyId)) / 1048576) * 10) / 10;
    default:
      return 0;
  }
}

// { limit, used, reached } for one limit of the current company.
export async function checkLimit(limit, adding = 1) {
  const company = await Company.findById(tenantId());
  const max = effectiveLimits(company)[limit];
  if (max === null || max === undefined) return { limit: null, used: null, reached: false };
  const used = await usageFor(limit);
  const reached = limit === 'storage_mb' ? used + adding / 1048576 > max : used + adding > max;
  return { limit: max, used, reached };
}

export function limitError(limit, max) {
  const err = new Error(
    `Your plan allows ${max} ${String(LIMITS[limit] || limit).toLowerCase()}. Ask the platform administrator to upgrade your plan.`
  );
  err.status = 403;
  err.code = 'limit_reached';
  return err;
}

export async function enforceLimit(limit, adding = 1) {
  const result = await checkLimit(limit, adding);
  if (result.reached) throw limitError(limit, result.limit);
  return result;
}

export async function usageOverview() {
  const company = await Company.findById(tenantId());
  const limits = effectiveLimits(company);
  const out = {};
  for (const key of Object.keys(limits)) out[key] = { label: LIMITS[key], limit: limits[key], used: await usageFor(key) };
  return out;
}
