import { Visit } from '../models/index.js';
import { extractPassToken } from '../utils/generateToken.js';
import { formatDate, formatDateNice, mapVisit } from '../utils/mappers.js';
import { validatePass } from '../services/visits.js';

function publicPass(row) {
  const visit = mapVisit(row);
  return {
    ok: true,
    visitor: row.visitor_name,
    company: row.visitor_company,
    host: visit.host,
    department: row.host_department,
    purpose: visit.purpose,
    date: formatDateNice(row.visit_date) || formatDate(row.visit_date),
    time: visit.time,
    ref: visit.ref,
    pin: visit.pin,
    status: visit.status,
    usedAt: visit.usedAt,
  };
}

// Gate check-in (signed-in reception, admin or super_admin).
export async function validatePassEndpoint(req, res) {
  const token = extractPassToken(req.body.token || req.body.qr || '');
  const pin = String(req.body.pin || '').trim();
  if (!token && !pin) {
    return res.status(400).json({ ok: false, reason: 'missing', error: 'Provide a QR token or PIN' });
  }
  const actor = `${req.user?.name || req.user?.username || 'Reception'} (gate)`;
  const result = await validatePass({ token: token || undefined, pin: pin || undefined, actor });
  if (!result.ok) {
    const status = result.reason === 'not_found' ? 404 : 400;
    return res.status(status).json(result);
  }
  res.json(result);
}

// Gate lookup by token or PIN, without checking the visitor in (signed-in staff only).
export async function lookupPassEndpoint(req, res) {
  const token = extractPassToken(req.query.token || '');
  const pin = String(req.query.pin || '').trim();
  if (!token && !pin) return res.status(400).json({ error: 'Invalid pass token or PIN' });
  const row = token ? await Visit.findByToken(token) : await Visit.findByPin(pin);
  if (!row) return res.status(404).json({ error: 'Pass not found' });
  res.json(publicPass(row));
}

// The visitor's own pass page: public, but only by the full 64-character token from the QR link.
export async function publicPassEndpoint(req, res) {
  const token = extractPassToken(req.params.token || '');
  if (!/^[a-f0-9]{64}$/i.test(token)) return res.status(404).json({ error: 'Pass not found' });
  const row = await Visit.findByToken(token);
  if (!row) return res.status(404).json({ error: 'Pass not found' });
  res.json(publicPass(row));
}
