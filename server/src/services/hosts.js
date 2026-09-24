import { Host } from '../models/index.js';

function label(host) {
  return {
    id: host.id,
    name: host.name,
    department: host.department || '',
    phone: host.phone || '',
  };
}

export async function matchHosts(query) {
  const q = String(query || '').trim();
  if (!q) return [];
  const exact = await Host.findByName(q);
  if (exact && exact.status === 'active') return [exact];
  const rows = await Host.search(q);
  return rows || [];
}

export async function resolveHostForNotify(query) {
  const matches = await matchHosts(query);
  if (!matches.length) {
    return {
      error: 'No host in the company directory matches that name or department. Ask the visitor for the host name or department. Do not invent a host.',
    };
  }
  if (matches.length === 1) {
    const host = matches[0];
    if (!host.phone) {
      return {
        error: `${host.name} is in the directory but has no WhatsApp number saved. Ask for another host.`,
        matches: [label(host)],
      };
    }
    return { host: label(host) };
  }
  return {
    error: 'Several hosts match. Ask the visitor to pick one by name.',
    matches: matches.map(label),
  };
}

export async function listActiveHosts() {
  const rows = await Host.listActive();
  return (rows || []).map(label);
}
