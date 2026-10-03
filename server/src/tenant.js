// The company (tenant) a piece of work belongs to. Every request from a company user, every
// WhatsApp message and every background job runs inside runWithTenant(); tenant-scoped database
// queries read the company from here. Outside a tenant context those queries throw, so data can
// never silently leak across companies.
import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

export function runWithTenant(companyId, fn) {
  const id = Number(companyId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('runWithTenant needs a company id');
  return storage.run({ companyId: id }, fn);
}

// The current company id. Throws when there is none.
export function tenantId() {
  const id = storage.getStore()?.companyId;
  if (!id) throw new Error('No company context for a tenant query');
  return id;
}

export function optionalTenantId() {
  return storage.getStore()?.companyId || null;
}
