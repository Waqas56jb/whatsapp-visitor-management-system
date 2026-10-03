import { Company, Visit } from '../models/index.js';
import { actorName } from '../middleware/auth.js';
import { companyBranding, companySettings } from '../services/companyConfig.js';
import { extractPassToken } from '../utils/generateToken.js';
import { formatDate, formatDateNice, mapVisit } from '../utils/mappers.js';
import { validatePass } from '../services/visits.js';

function publicPass(row, company) {
  const visit = mapVisit(row);
  const branding = company ? companyBranding(company) : null;
  const settings = company ? companySettings(company) : null;
  return {
    ok: true,
    visitor: row.visitor_name,
    company: row.visitor_company,
    host: visit.host,
    department: row.host_department,
    office: row.host_office || '',
    purpose: visit.purpose,
    kind: visit.kind,
    date: formatDateNice(row.visit_date) || formatDate(row.visit_date),
    time: visit.time,
    ref: visit.ref,
    pin: visit.pin,
    status: visit.status,
    usedAt: visit.usedAt,
    organisation: company
      ? {
          name: branding.displayName || company.name,
          logo: branding.logo || '',
          primaryColor: branding.primaryColor,
          accentColor: branding.accentColor,
          address: [settings.address, settings.location].filter(Boolean).join(', '),
        }
      : null,
  };
}

// Gate check-in (gate staff of the signed-in user's company).
export async function validatePassEndpoint(req, res) {
  const token = extractPassToken(req.body.token || req.body.qr || '');
  const pin = String(req.body.pin || '').trim();
  if (!token && !pin) return res.status(400).json({ ok: false, reason: 'missing', error: 'Provide a QR token or PIN' });
  const result = await validatePass({ token: token || undefined, pin: pin || undefined, actor: `${actorName(req)} (gate)` });
  if (!result.ok) return res.status(result.reason === 'not_found' ? 404 : 400).json(result);
  res.json(result);
}

// Gate lookup by token or PIN, without checking the visitor in.
export async function lookupPassEndpoint(req, res) {
  const token = extractPassToken(req.query.token || '');
  const pin = String(req.query.pin || '').trim();
  if (!token && !pin) return res.status(400).json({ error: 'Invalid pass token or PIN' });
  const row = token ? await Visit.findByToken(token) : await Visit.findByPin(pin);
  if (!row) return res.status(404).json({ error: 'Pass not found' });
  res.json({ ...publicPass(row, req.company), id: row.id, flagged: Boolean(row.flagged), flagReason: row.flag_reason || '', checkedOutAt: row.checked_out_at });
}

// The visitor's own pass page: public, but only by the full 64-character token from the QR link.
// Shows the company's branding.
export async function publicPassEndpoint(req, res) {
  const token = extractPassToken(req.params.token || '');
  if (!/^[a-f0-9]{64}$/i.test(token)) return res.status(404).json({ error: 'Pass not found' });
  const row = await Visit.findPublicByToken(token);
  if (!row) return res.status(404).json({ error: 'Pass not found' });
  const company = await Company.findById(row.company_id);
  if (!company || company.status === 'terminated') return res.status(404).json({ error: 'Pass not found' });
  res.json(publicPass(row, company));
}
