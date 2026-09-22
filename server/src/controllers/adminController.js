import bcrypt from 'bcryptjs';
import {
  Account,
  Audit,
  Host,
  Settings,
  Visit,
  Visitor,
  dashboardStats,
  reportSummary,
  visitsByDepartment,
} from '../models/index.js';
import { generateQrImage } from '../utils/generateToken.js';
import { mapAccount, mapAudit, mapHost, mapVisit, mapVisitor } from '../utils/mappers.js';
import { createPendingVisit, decideVisit } from '../services/visits.js';

function actorName(req) {
  return req.user?.name || req.user?.username || 'Admin';
}

async function hydrateVisit(id) {
  const row = await Visit.findById(id);
  const mapped = mapVisit(row);
  if (mapped?.qrToken) mapped.qrImage = await generateQrImage(mapped.qrToken);
  return mapped;
}

export async function getDashboardStats(req, res) {
  const stats = await dashboardStats();
  res.json(stats);
}

export async function listVisitors(req, res) {
  const rows = await Visitor.listWithStats();
  res.json(rows.map(mapVisitor));
}

export async function getVisitor(req, res) {
  const rows = await Visitor.listWithStats();
  const found = rows.find((r) => String(r.id) === String(req.params.id));
  if (!found) return res.status(404).json({ error: 'Visitor not found' });
  res.json(mapVisitor(found));
}

export async function listVisits(req, res) {
  const rows = await Visit.list({ status: req.query.status, limit: req.query.limit });
  res.json(rows.map(mapVisit));
}

export async function createVisit(req, res) {
  try {
    const name = String(req.body.name || req.body.visitor || '').trim();
    const company = String(req.body.company || '').trim() || '—';
    const hostName = String(req.body.host || '').trim();
    const purpose = String(req.body.purpose || '').trim() || '—';
    const date = req.body.date || req.body.visit_date;
    const time = req.body.time || req.body.visit_time || '—';
    const full = await createPendingVisit({
      name,
      company,
      hostName,
      hostId: req.body.host_id,
      purpose,
      date,
      time,
      visitType: req.body.visit_type || req.body.visitType || 'official',
      visitorPhone: req.body.phone || req.body.visitor_phone,
      actor: actorName(req),
      notify: true,
    });
    res.status(201).json(mapVisit(full));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not create visit' });
  }
}

export async function approveVisit(req, res) {
  try {
    const { visit } = await decideVisit({
      visitId: req.params.id,
      decision: 'approved',
      actor: actorName(req),
      actorHostId: req.user?.role === 'host' ? req.user.hostId : null,
    });
    res.json(await hydrateVisit(visit.id));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not approve visit' });
  }
}

export async function rejectVisit(req, res) {
  try {
    const { visit } = await decideVisit({
      visitId: req.params.id,
      decision: 'rejected',
      actor: actorName(req),
      actorHostId: req.user?.role === 'host' ? req.user.hostId : null,
    });
    res.json(await hydrateVisit(visit.id));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not reject visit' });
  }
}

export async function listPasses(req, res) {
  const rows = await Visit.list({ status: 'approved', hostId: req.user.role === 'host' ? req.user.hostId : undefined });
  const mapped = [];
  for (const row of rows) {
    const item = mapVisit(row);
    item.qrImage = row.qr_token ? await generateQrImage(row.qr_token) : null;
    mapped.push(item);
  }
  res.json(mapped);
}

export async function revokePass(req, res) {
  const visit = await Visit.findById(req.params.id);
  if (!visit) return res.status(404).json({ error: 'Pass not found' });
  await Visit.decide(visit.id, 'rejected', visit.pin, visit.qr_token);
  await Audit.add({
    actor: actorName(req),
    action: 'Revoked pass',
    details: `${visit.ref_number} — ${visit.visitor_name}`,
  });
  res.json({ ok: true });
}

export async function listHosts(req, res) {
  const rows = await Host.list();
  res.json(rows.map(mapHost));
}

export async function createHost(req, res) {
  const name = String(req.body.name || '').trim();
  const department = String(req.body.department || req.body.dept || '').trim();
  const phone = String(req.body.phone || '').trim();
  if (!name || !department) return res.status(400).json({ error: 'Please fill in name and department' });
  const host = await Host.create({ name, department, phone });
  await Audit.add({ actor: actorName(req), action: 'Added host', details: `${name} (${department})` });
  res.status(201).json(mapHost(host));
}

export async function updateHost(req, res) {
  const existing = await Host.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Host not found' });
  const fields = {};
  if (req.body.name !== undefined) fields.name = req.body.name;
  if (req.body.department !== undefined || req.body.dept !== undefined) fields.department = req.body.department || req.body.dept;
  if (req.body.phone !== undefined) fields.phone = req.body.phone;
  if (req.body.status !== undefined) fields.status = req.body.status;
  if (req.body.toggleStatus) {
    fields.status = existing.status === 'active' ? 'inactive' : 'active';
  }
  const host = await Host.update(req.params.id, fields);
  if (fields.status) {
    await Audit.add({ actor: actorName(req), action: 'Updated host status', details: `${host.name} → ${host.status}` });
  }
  res.json(mapHost(host));
}

export async function listAccounts(req, res) {
  const rows = await Account.list();
  res.json(rows.map(mapAccount));
}

export async function createAccount(req, res) {
  const name = String(req.body.name || '').trim();
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const role = String(req.body.role || 'Host');
  if (!name || !username || !password) return res.status(400).json({ error: 'Please fill in every field' });
  if (await Account.findByUsername(username)) {
    return res.status(409).json({ error: 'That username is already taken' });
  }
  const password_hash = await bcrypt.hash(password, 10);
  const account = await Account.create({ name, username, password_hash, role });
  let host = await Host.findByName(name);
  if (!host && role === 'Host') {
    host = await Host.create({ name, department: req.body.department || '—', phone: req.body.phone || '', account_id: account.id });
  } else if (host && !host.account_id) {
    await Host.update(host.id, { account_id: account.id });
  }
  await Audit.add({ actor: actorName(req), action: 'Created client account', details: `${username} (${role})` });
  res.status(201).json(mapAccount(account));
}

export async function toggleAccount(req, res) {
  const account = await Account.toggle(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  await Audit.add({ actor: actorName(req), action: 'Updated account status', details: `${account.username} → ${account.status}` });
  res.json(mapAccount(account));
}

export async function getReportsSummary(req, res) {
  const summary = await reportSummary();
  const depts = await visitsByDepartment();
  res.json({ ...summary, depts });
}

export async function exportReport(req, res) {
  const type = req.query.type || 'visits';
  let rows = [];
  if (type === 'visits') rows = (await Visit.list()).map(mapVisit);
  else if (type === 'visitors') rows = (await Visitor.listWithStats()).map(mapVisitor);
  else if (type === 'audit') rows = (await Audit.list()).map(mapAudit);
  else return res.status(400).json({ error: 'Unknown export type' });
  if (!rows.length) return res.status(404).json({ error: 'Nothing to export yet' });
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(','), ...rows.map((row) => keys.map((k) => `"${String(row[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="botho-${type}.csv"`);
  res.send(csv);
}

export async function listAudit(req, res) {
  const rows = await Audit.list(req.query.limit);
  res.json(rows.map(mapAudit));
}

export async function getSettings(req, res) {
  const row = await Settings.get();
  res.json({
    orgName: row?.org_name || 'Botho Innovations',
    phone: row?.phone || '+27 00 000 0000',
    email: row?.email || 'support@bothoinnovations.com',
  });
}

export async function updateSettings(req, res) {
  const row = await Settings.upsert({
    org_name: req.body.orgName || req.body.org_name || 'Botho Innovations',
    phone: req.body.phone || '+27 00 000 0000',
    email: req.body.email || 'support@bothoinnovations.com',
  });
  res.json({ orgName: row.org_name, phone: row.phone, email: row.email });
}

export async function createPublicVisit(req, res) {
  const name = String(req.body.name || '').trim();
  const hostName = String(req.body.host || '').trim();
  const date = req.body.date;
  if (!name || !hostName || !date) return res.status(400).json({ error: 'name, host and date are required' });
  req.body.visitor = name;
  return createVisit(req, res);
}
