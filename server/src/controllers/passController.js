import { Visit } from '../models/index.js';
import { extractPassToken } from '../utils/generateToken.js';
import { formatDate, formatDateNice, mapVisit } from '../utils/mappers.js';
import { validatePass } from '../services/visits.js';

export async function validatePassEndpoint(req, res) {
  const token = extractPassToken(req.body.token || '');
  if (!token) {
    return res.status(400).json({ ok: false, reason: 'missing', error: 'Provide token' });
  }
  const result = await validatePass({ token });
  if (!result.ok) {
    const status = result.reason === 'not_found' ? 404 : 400;
    return res.status(status).json(result);
  }
  res.json(result);
}

export async function lookupPassEndpoint(req, res) {
  const token = extractPassToken(req.params.token || '');
  if (!token) return res.status(400).json({ error: 'Invalid pass token' });
  const row = await Visit.findByToken(token);
  if (!row) return res.status(404).json({ error: 'Pass not found' });
  const visit = mapVisit(row);
  res.json({
    ok: true,
    visitor: row.visitor_name,
    company: row.visitor_company,
    host: visit.host,
    department: row.host_department,
    purpose: visit.purpose,
    date: formatDateNice(row.visit_date) || formatDate(row.visit_date),
    time: visit.time,
    ref: visit.ref,
    status: visit.status,
    usedAt: visit.usedAt,
  });
}
