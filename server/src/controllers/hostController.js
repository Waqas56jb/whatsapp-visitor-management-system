import { Audit, Host, Visit } from '../models/index.js';
import { generateQrImage } from '../utils/generateToken.js';
import { mapAudit, mapVisit } from '../utils/mappers.js';

function hostIdFrom(req) {
  return req.user?.hostId;
}

export async function hostDashboard(req, res) {
  const hostId = hostIdFrom(req);
  if (!hostId) return res.json({ pending: 0, approved: 0, total: 0, requests: [] });
  const visits = (await Visit.list({ hostId })).map(mapVisit);
  const pending = visits.filter((v) => v.status === 'pending');
  res.json({
    pending: pending.length,
    approved: visits.filter((v) => v.status === 'approved').length,
    total: visits.length,
    requests: pending,
  });
}

export async function hostVisits(req, res) {
  const hostId = hostIdFrom(req);
  if (!hostId) return res.json([]);
  const visits = (await Visit.list({ hostId })).map(mapVisit);
  res.json(visits);
}

export async function hostPasses(req, res) {
  const hostId = hostIdFrom(req);
  if (!hostId) return res.json([]);
  const rows = await Visit.list({ hostId, status: 'approved' });
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
  const hostId = hostIdFrom(req);
  const visits = hostId ? await Visit.list({ hostId }) : [];
  const visitorNames = visits.map((v) => v.visitor_name);
  const actor = req.user?.name || '';
  const audit = await Audit.list(50);
  const relevant = audit.filter(
    (a) => visitorNames.some((n) => (a.details || '').includes(n)) || a.actor === actor
  );
  res.json(relevant.slice(0, 12).map(mapAudit));
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
  req.user.role = 'host';
  const { approveVisit } = await import('./adminController.js');
  return approveVisit(req, res);
}

export async function hostReject(req, res) {
  req.user.role = 'host';
  const { rejectVisit } = await import('./adminController.js');
  return rejectVisit(req, res);
}
