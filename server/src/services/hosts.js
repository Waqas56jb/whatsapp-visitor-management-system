import { Host } from '../models/index.js';

function label(host) {
  return {
    id: host.id,
    name: host.name,
    department: host.department || '',
    phone: host.phone || '',
    status: host.status,
  };
}

export async function listActiveHosts() {
  const rows = await Host.listActive();
  return (rows || []).map(label);
}
