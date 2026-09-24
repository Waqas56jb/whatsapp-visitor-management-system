import { Audit, Host, Visit } from '../models/index.js';
import { generateQrImage } from '../utils/generateToken.js';
import { mapAudit, mapHost, mapVisit } from '../utils/mappers.js';
import { normalizePhone } from '../utils/phone.js';

function hostIdFrom(req) {
  return req.user?.hostId;
}

export async function hostDashboard(req, res) {
  const visits = (await Visit.list()).map(mapVisit);
  const pending = visits.filter((v) => v.status === 'pending');
  res.json({
    pending: pending.length,
    approved: visits.filter((v) => v.status === 'approved').length,
    total: visits.length,
    requests: pending,
  });
}

export async function hostVisits(req, res) {
  const visits = (await Visit.list()).map(mapVisit);
  res.json(visits);
}

export async function hostPasses(req, res) {
  const rows = await Visit.list({ status: 'approved' });
  const out = [];
  for (const row of rows) {
    const item = mapVisit(row);
    item.qrImage = row.qr_token ? await generateQrImage(row.qr_token) : null;
    out.push(item);
  }
  res.json(out);
}

export async function hostHistory(req, res) {
  return hostVisits(req, res);
}

export async function hostNotifications(req, res) {
  const visits = await Visit.list({ limit: 40 });
  const pending = visits
    .filter((v) => v.status === 'pending')
    .map((v) => ({
      id: `pending-${v.id}`,
      time: v.created_at ? new Date(v.created_at).toLocaleString() : 'Just now',
      actor: 'Visitor',
      action: 'New visit request',
      details: `${v.visitor_name} → ${v.host_name} · ${v.purpose} · ${v.ref_number}`,
      type: 'pending',
      visitId: v.id,
    }));
  const actor = req.user?.name || '';
  const audit = await Audit.list(50);
  const relevant = audit
    .filter((a) => /visit|approved|rejected|created visit/i.test(`${a.action} ${a.details}`) || a.actor === actor)
    .slice(0, 12)
    .map(mapAudit);
  res.json([...pending, ...relevant].slice(0, 20));
}

export async function hostProfile(req, res) {
  const host = hostIdFrom(req) ? await Host.findById(hostIdFrom(req)) : null;
  res.json({
    name: req.user.name,
    username: req.user.username,
    role: 'Host',
    department: host?.department || '—',
  });
}

export async function hostApprove(req, res) {
  req.user.role = 'admin';
  const { approveVisit } = await import('./adminController.js');
  return approveVisit(req, res);
}

export async function hostReject(req, res) {
  req.user.role = 'admin';
  const { rejectVisit } = await import('./adminController.js');
  return rejectVisit(req, res);
}

export async function listCompanyHosts(req, res) {
  const rows = await Host.list();
  res.json(rows.map(mapHost));
}

export async function createCompanyHost(req, res) {
  const name = String(req.body.name || '').trim();
  const department = String(req.body.department || req.body.dept || '').trim();
  const phone = normalizePhone(req.body.phone);
  if (!name || !department || !phone) {
    return res.status(400).json({ error: 'Add host name, department, and WhatsApp number' });
  }
  const host = await Host.create({ name, department, phone });
  await Audit.add({
    actor: req.user?.name || req.user?.username || 'Host',
    action: 'Added host',
    details: `${name} (${department}) ${phone}`,
  });
  res.status(201).json(mapHost(host));
}

export async function updateCompanyHost(req, res) {
  const existing = await Host.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Host not found' });
  const fields = {};
  if (req.body.name !== undefined) fields.name = String(req.body.name || '').trim();
  if (req.body.department !== undefined || req.body.dept !== undefined) {
    fields.department = String(req.body.department || req.body.dept || '').trim();
  }
  if (req.body.phone !== undefined) fields.phone = normalizePhone(req.body.phone);
  if (req.body.status !== undefined) fields.status = req.body.status;
  if (fields.phone !== undefined && !fields.phone) {
    return res.status(400).json({ error: 'Enter a valid WhatsApp number' });
  }
  if (fields.name !== undefined && !fields.name) return res.status(400).json({ error: 'Name is required' });
  const host = await Host.update(req.params.id, fields);
  res.json(mapHost(host));
}

export async function deleteCompanyHost(req, res) {
  const existing = await Host.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Host not found' });
  await Host.remove(req.params.id);
  await Audit.add({
    actor: req.user?.name || req.user?.username || 'Host',
    action: 'Deleted host',
    details: `${existing.name} · ${existing.department} · ${existing.phone}`,
  });
  res.json({ ok: true });
}
