// The company console: daily operations of one company (always the signed-in user's company,
// from the tenant context). Hosts, visits, passes, feedback, service requests, reports, staff
// and roles, settings, branding and integrations.
import { ROLE_LABELS } from '../config/permissions.js';
import { Audit, Company, Document, Feedback, Host, ServiceRequest, Visit, Visitor, companyDashboard } from '../models/index.js';
import { actorName } from '../middleware/auth.js';
import { cleanBrandingPatch, cleanSettingsPatch, companyBranding, companySettings, describeCompany } from '../services/companyConfig.js';
import { enforceLimit, usageOverview } from '../services/limits.js';
import { loginScope } from '../services/logins.js';
import { buildReport, reportPdf, toCsv } from '../services/reports.js';
import { testSlack } from '../services/slack.js';
import { checkOutVisit, createPendingVisit, decideVisit } from '../services/visits.js';
import { tenantId } from '../tenant.js';
import { todayIn } from '../utils/dateParse.js';
import { generateQrImage } from '../utils/generateToken.js';
import { mapAudit, mapHost, mapVisit, mapVisitor } from '../utils/mappers.js';
import { SERVICE_LABELS } from '../whatsapp/flowAgent.js';
import { notifyServiceUpdate } from '../whatsapp/notify.js';

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function today(req) {
  return todayIn(companySettings(req.company).timezone);
}

const audit = (req, action, details) => Audit.add({ actor: actorName(req), action, details });

async function hydrateVisit(id) {
  const mapped = mapVisit(await Visit.findById(id));
  if (mapped?.qrToken) mapped.qrImage = await generateQrImage(mapped.qrToken);
  return mapped;
}

// Gate and reception lists never carry the PIN or QR token.
function gateSafe({ pin, qrToken, visitorPhone, screening, ...rest }) {
  return rest;
}

// ------------------------------------------------------------------ dashboard

export async function dashboard(req, res) {
  const day = today(req);
  const [stats, visits, feedback, requests] = await Promise.all([
    companyDashboard(day),
    Visit.list({ fromDate: day, toDate: day }),
    Feedback.list(),
    ServiceRequest.list(),
  ]);
  const pending = (await Visit.list({ status: 'pending', limit: 50 })).map(mapVisit);
  res.json({
    stats,
    today: visits.map(mapVisit).sort((a, b) => String(a.time).localeCompare(String(b.time))),
    pending,
    flagged: pending.filter((v) => v.flagged),
    recentFeedback: feedback.slice(0, 5).map(mapFeedback),
    openRequests: requests.filter((r) => ['open', 'in_progress'].includes(r.status)).slice(0, 5).map(mapRequest),
  });
}

// ------------------------------------------------------------------ visitors & visits

export async function listVisitors(req, res) {
  res.json((await Visitor.listWithStats()).map(mapVisitor));
}

export async function getVisitor(req, res) {
  const visitor = await Visitor.findById(req.params.id);
  if (!visitor) throw httpError(404, 'Visitor not found');
  const visits = visitor.phone ? await Visit.listByVisitorPhone(visitor.phone, 50) : [];
  const id = await Document.latestIdForVisitor(visitor.id);
  res.json({ ...mapVisitor(visitor), history: visits.map(mapVisit), idDocumentId: id?.id || null });
}

export async function listVisits(req, res) {
  const rows = await Visit.list({
    status: req.query.status,
    limit: req.query.limit,
    fromDate: req.query.from || undefined,
    toDate: req.query.to || undefined,
  });
  let list = rows.map(mapVisit);
  if (req.query.kind === 'visit' || req.query.kind === 'appointment') list = list.filter((v) => v.kind === req.query.kind);
  if (req.query.flagged === 'true') list = list.filter((v) => v.flagged);
  res.json(list);
}

export async function getVisit(req, res) {
  const visit = await hydrateVisit(req.params.id);
  if (!visit) throw httpError(404, 'Visit not found');
  const doc = await Document.forVisit(visit.id);
  res.json({ ...visit, idDocumentId: doc?.id || null });
}

// Today's visits for reception and gate staff (no PINs or QR tokens).
export async function listTodayVisits(req, res) {
  const day = today(req);
  const rows = (await Visit.list({ fromDate: day, toDate: day })).map(mapVisit);
  res.json(rows.sort((a, b) => String(a.time).localeCompare(String(b.time))).map(gateSafe));
}

// Live gate traffic: who entered and who left today, and who is on site now.
export async function gateTraffic(req, res) {
  const day = today(req);
  const rows = (await Visit.listGateActivity(day)).map(mapVisit).map(gateSafe);
  const events = [];
  for (const v of rows) {
    if (v.usedAt) events.push({ type: 'in', at: v.usedAt, visit: v });
    if (v.checkedOutAt) events.push({ type: 'out', at: v.checkedOutAt, visit: v });
  }
  events.sort((a, b) => new Date(b.at) - new Date(a.at));
  res.json({
    onSite: rows.filter((v) => v.status === 'used' && !v.checkedOutAt),
    expected: rows.filter((v) => v.status === 'approved' && v.date === day),
    events: events.slice(0, 100),
  });
}

export async function createVisit(req, res) {
  await enforceLimit('visits_per_month');
  const name = String(req.body.name || req.body.visitor || '').trim();
  const kind = req.body.kind === 'appointment' ? 'appointment' : 'visit';
  const full = await createPendingVisit({
    name,
    company: String(req.body.company || '').trim() || '—',
    hostName: String(req.body.host || '').trim(),
    hostId: req.body.host_id || req.body.hostId,
    purpose: String(req.body.purpose || '').trim() || '—',
    date: req.body.date || req.body.visit_date,
    time: req.body.time || req.body.visit_time || '—',
    visitType: req.body.visit_type || req.body.visitType || 'official',
    visitorPhone: req.body.phone || req.body.visitor_phone,
    kind,
    appointmentType: kind === 'appointment' ? String(req.body.appointmentType || '') : '',
    topic: kind === 'appointment' ? String(req.body.topic || '') : '',
    actor: actorName(req),
    notify: true,
  });
  res.status(201).json(mapVisit(full));
}

export async function approveVisit(req, res) {
  const { visit } = await decideVisit({ visitId: req.params.id, decision: 'approved', actor: actorName(req) });
  res.json(await hydrateVisit(visit.id));
}

export async function rejectVisit(req, res) {
  const { visit } = await decideVisit({ visitId: req.params.id, decision: 'rejected', actor: actorName(req) });
  res.json(await hydrateVisit(visit.id));
}

// Flag a visit for security attention (or clear the flag).
export async function flagVisit(req, res) {
  const visit = await Visit.findById(req.params.id);
  if (!visit) throw httpError(404, 'Visit not found');
  const flagged = req.body.flagged !== false;
  const reason = flagged ? String(req.body.reason || '').trim().slice(0, 300) || 'Flagged by staff' : '';
  await Visit.setFlag(visit.id, flagged, reason);
  await audit(req, flagged ? 'Flagged visit' : 'Cleared visit flag', `${visit.ref_number} — ${visit.visitor_name}${reason ? `: ${reason}` : ''}`);
  res.json(await hydrateVisit(visit.id));
}

export async function checkOut(req, res) {
  const result = await checkOutVisit({ visitId: req.params.id, actor: `${actorName(req)} (gate)` });
  res.json({ ok: true, ...result });
}

export async function listPasses(req, res) {
  const rows = await Visit.list({ status: 'approved' });
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
  if (!visit) throw httpError(404, 'Pass not found');
  if (visit.status !== 'approved') throw httpError(400, `This pass is ${visit.status} and cannot be revoked.`);
  await Visit.setStatus(visit.id, 'rejected');
  await audit(req, 'Revoked pass', `${visit.ref_number} — ${visit.visitor_name}`);
  res.json({ ok: true });
}

// An uploaded ID document or attachment (staff only; never public).
export async function getDocument(req, res) {
  const doc = await Document.find(req.params.id);
  if (!doc) throw httpError(404, 'Document not found');
  await audit(req, 'Viewed visitor document', `#${doc.id} (${doc.kind})`);
  res.setHeader('Content-Type', doc.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${String(doc.file_name || `document-${doc.id}`).replace(/[^\w.-]/g, '_')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(doc.data);
}

// ------------------------------------------------------------------ hosts

export async function listHosts(req, res) {
  res.json((await Host.list()).map(mapHost));
}

function hostFields(body) {
  const fields = {};
  if (body.name !== undefined) fields.name = String(body.name).trim();
  if (body.department !== undefined || body.dept !== undefined) fields.department = String(body.department ?? body.dept).trim();
  if (body.phone !== undefined) fields.phone = String(body.phone).trim();
  if (body.office !== undefined) fields.office = String(body.office).trim().slice(0, 120);
  if (body.email !== undefined) fields.email = String(body.email).trim().slice(0, 160);
  return fields;
}

export async function createHost(req, res) {
  const fields = hostFields(req.body);
  if (!fields.name || !fields.department) throw httpError(400, 'Please fill in name and department');
  await enforceLimit('hosts');
  const host = await Host.create({ phone: '', ...fields });
  await audit(req, 'Added host', `${host.name} (${host.department})`);
  res.status(201).json(mapHost(host));
}

export async function updateHost(req, res) {
  const existing = await Host.findById(req.params.id);
  if (!existing) throw httpError(404, 'Host not found');
  const fields = hostFields(req.body);
  if (req.body.status !== undefined) fields.status = ['active', 'inactive', 'blocked'].includes(req.body.status) ? req.body.status : existing.status;
  if (req.body.toggleStatus) fields.status = existing.status === 'active' ? 'inactive' : 'active';
  const host = await Host.update(existing.id, fields);
  await audit(req, fields.status && fields.status !== existing.status ? 'Updated host status' : 'Updated host', `${host.name}${fields.status ? ` → ${host.status}` : ''}`);
  res.json(mapHost(host));
}

export async function setHostStatus(req, res, status) {
  const host = await Host.setStatus(req.params.id, status);
  if (!host) throw httpError(404, 'Host not found');
  await audit(req, status === 'blocked' ? 'Blocked host' : 'Unblocked host', `${host.name} (${host.department})`);
  res.json(mapHost(host));
}

export async function deleteHost(req, res) {
  if (req.body?.confirm !== true) throw httpError(400, 'Confirmation required');
  const existing = await Host.findById(req.params.id);
  if (!existing) throw httpError(404, 'Host not found');
  await Host.remove(existing.id);
  await audit(req, 'Deleted host', `${existing.name} · ${existing.department} · ${existing.phone || 'no phone'}`);
  res.json({ ok: true, deleted: mapHost(existing) });
}

// ------------------------------------------------------------------ feedback & service requests

function mapFeedback(f) {
  return {
    id: f.id,
    ref: f.ref_number,
    phone: f.phone,
    visitor: f.visitor_name || null,
    visitId: f.visit_id,
    topic: f.topic,
    rating: f.rating,
    comment: f.comment,
    isComplaint: f.is_complaint,
    contactRequested: f.contact_requested,
    status: f.status,
    createdAt: f.created_at,
  };
}

export async function listFeedback(req, res) {
  res.json((await Feedback.list()).map(mapFeedback));
}

export async function updateFeedback(req, res) {
  const status = ['new', 'reviewed', 'resolved'].includes(req.body.status) ? req.body.status : null;
  if (!status) throw httpError(400, 'Choose a status: new, reviewed or resolved');
  const row = await Feedback.setStatus(req.params.id, status);
  if (!row) throw httpError(404, 'Feedback not found');
  await audit(req, 'Updated feedback', `${row.ref_number} → ${status}`);
  res.json(mapFeedback(row));
}

function mapRequest(r) {
  return {
    id: r.id,
    ref: r.ref_number,
    phone: r.phone,
    visitor: r.visitor_name || null,
    category: r.category,
    description: r.description,
    priority: r.priority,
    status: r.status,
    staffNote: r.staff_note,
    attachmentId: r.attachment_id || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listServiceRequests(req, res) {
  res.json((await ServiceRequest.list()).map(mapRequest));
}

// Staff update a ticket; the visitor is told on WhatsApp when the status changes.
export async function updateServiceRequest(req, res) {
  const existing = await ServiceRequest.findById(req.params.id);
  if (!existing) throw httpError(404, 'Service request not found');
  const fields = {};
  if (req.body.status !== undefined) {
    if (!SERVICE_LABELS[req.body.status]) throw httpError(400, 'Unknown status');
    fields.status = req.body.status;
  }
  if (req.body.priority !== undefined) {
    if (!['low', 'normal', 'high', 'critical'].includes(req.body.priority)) throw httpError(400, 'Unknown priority');
    fields.priority = req.body.priority;
  }
  if (req.body.staffNote !== undefined) fields.staff_note = String(req.body.staffNote).trim().slice(0, 1000);
  const row = await ServiceRequest.update(existing.id, fields);
  let notified = false;
  if (fields.status && fields.status !== existing.status) {
    const [en, tn] = SERVICE_LABELS[fields.status];
    notified = await notifyServiceUpdate(row, en, tn).catch(() => false);
  }
  await audit(req, 'Updated service request', `${row.ref_number}${fields.status ? ` → ${fields.status}` : ''}`);
  res.json({ ...mapRequest(row), visitorNotified: notified });
}

// ------------------------------------------------------------------ reports

function reportRange(req) {
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : today(req);
  const fallbackFrom = new Date(`${to}T00:00:00Z`);
  fallbackFrom.setUTCDate(fallbackFrom.getUTCDate() - 29);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : fallbackFrom.toISOString().slice(0, 10);
  if (from > to) throw httpError(400, 'The start date must be before the end date');
  return { from, to };
}

export async function reportSummary(req, res) {
  const { from, to } = reportRange(req);
  res.json(await buildReport(from, to));
}

export async function exportReport(req, res) {
  const type = String(req.query.type || 'visits');
  const { from, to } = reportRange(req);
  const inRange = (day) => day >= from && day <= to;
  let rows = [];
  if (type === 'visits') {
    rows = (await Visit.list({ fromDate: from, toDate: to })).map(mapVisit).map(({ qrToken, screening, ...v }) => v);
  } else if (type === 'visitors') rows = (await Visitor.listWithStats()).map(mapVisitor);
  else if (type === 'feedback') rows = (await Feedback.list()).map(mapFeedback).filter((f) => inRange(new Date(f.createdAt).toISOString().slice(0, 10)));
  else if (type === 'service') rows = (await ServiceRequest.list()).map(mapRequest).filter((r) => inRange(new Date(r.createdAt).toISOString().slice(0, 10)));
  else if (type === 'audit') rows = (await Audit.list(2000)).map(mapAudit);
  else if (type === 'hosts') rows = (await buildReport(from, to)).byHost;
  else if (type === 'peak') rows = (await buildReport(from, to)).byHour;
  else if (type === 'daily') rows = (await buildReport(from, to)).byDay;
  else throw httpError(400, 'Unknown export type');
  if (!rows.length) throw httpError(404, 'Nothing to export for this period');
  await audit(req, 'Exported report', `${type} (${from} → ${to})`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-${from}-to-${to}.csv"`);
  res.send(`﻿${toCsv(rows)}`);
}

export async function exportReportPdf(req, res) {
  const { from, to } = reportRange(req);
  const report = await buildReport(from, to);
  const branding = companyBranding(req.company);
  const pdf = await reportPdf(report, { companyName: branding.displayName || req.company.name, color: branding.primaryColor });
  await audit(req, 'Exported PDF report', `${from} → ${to}`);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="report-${from}-to-${to}.pdf"`);
  res.send(pdf);
}

export async function listAudit(req, res) {
  res.json((await Audit.list(Math.min(Number(req.query.limit) || 300, 2000))).map(mapAudit));
}

// ------------------------------------------------------------------ staff & roles

export async function listStaff(req, res) {
  res.json({ staff: await loginScope(tenantId()).list(), roles: loginScope(tenantId()).roles.map((r) => ({ key: r, label: ROLE_LABELS[r] })) });
}

export async function createStaff(req, res) {
  await enforceLimit('staff');
  const { login, password } = await loginScope(tenantId()).create(req.body);
  await audit(req, 'Added staff login', `${login.username} (${login.roleLabel})`);
  res.status(201).json({ login, password });
}

export async function updateStaff(req, res) {
  const scope = loginScope(tenantId());
  let result;
  if (req.body.role !== undefined) result = await scope.setRole(req.user.adminId, req.params.id, String(req.body.role));
  if (req.body.status !== undefined) result = await scope.setStatus(req.user.adminId, req.params.id, req.body.status === 'blocked' ? 'blocked' : 'active');
  if (req.body.name !== undefined || req.body.email !== undefined) result = await scope.update(req.params.id, req.body);
  if (!result) throw httpError(400, 'Nothing to change');
  const changes = ['role', 'status', 'name', 'email'].filter((k) => req.body[k] !== undefined).map((k) => `${k} → ${req.body[k]}`);
  await audit(req, req.body.status === 'blocked' ? 'Deactivated staff login' : 'Updated staff login', `${result.target.username}: ${changes.join(', ')}`);
  res.json(result.login);
}

export async function deleteStaff(req, res) {
  if (req.body?.confirm !== true) throw httpError(400, 'Confirmation required');
  const { target } = await loginScope(tenantId()).remove(req.user.adminId, req.params.id);
  await audit(req, 'Deleted staff login', `${target.username} (${ROLE_LABELS[target.role]})`);
  res.json({ ok: true });
}

export async function resetStaffPassword(req, res) {
  const { target, password } = await loginScope(tenantId()).resetPassword(req.params.id, req.body);
  await audit(req, 'Reset staff password', target.username);
  res.json({ ok: true, password });
}

// ------------------------------------------------------------------ settings, branding, plan

export async function getSettings(req, res) {
  const d = describeCompany(req.company);
  res.json({
    profile: { name: d.name, registrationNumber: req.company.registration_number, domain: req.company.domain },
    settings: d.settings,
    branding: d.branding,
    plan: { key: d.plan, name: d.planInfo.name, price: d.planInfo.price, currency: d.planInfo.currency },
    features: d.features,
    limits: d.limits,
  });
}

export async function updateSettings(req, res) {
  const patch = cleanSettingsPatch(req.body || {});
  if (patch.templates && !describeCompany(req.company).features.white_label) throw httpError(403, 'Message templates are not included in your plan.');
  if (patch.integrations?.slackWebhook && !describeCompany(req.company).features.slack) throw httpError(403, 'Slack is not included in your plan.');
  if (patch.integrations?.wifi?.enabled && !describeCompany(req.company).features.guest_wifi) throw httpError(403, 'Guest Wi-Fi is not included in your plan.');
  const row = await Company.mergeSettings(tenantId(), patch);
  await audit(req, 'Updated company settings', Object.keys(patch).join(', ') || 'no changes');
  res.json({ settings: companySettings(row) });
}

export async function updateBranding(req, res) {
  if (!describeCompany(req.company).features.white_label) throw httpError(403, 'White-labelling is not included in your plan.');
  const patch = cleanBrandingPatch(req.body || {});
  const row = await Company.mergeBranding(tenantId(), patch);
  await audit(req, 'Updated branding', Object.keys(patch).join(', ') || 'no changes');
  res.json({ branding: companyBranding(row) });
}

export async function testSlackWebhook(req, res) {
  const { integrations } = companySettings(req.company);
  const url = String(req.body.webhook || integrations.slackWebhook || '');
  if (!/^https:\/\/hooks\.slack\.com\//.test(url)) throw httpError(400, 'Save a Slack webhook URL first (https://hooks.slack.com/…).');
  try {
    await testSlack(url, req.company.name);
  } catch (err) {
    throw httpError(400, `Slack did not accept the message: ${err.message}`);
  }
  res.json({ ok: true });
}

export async function planUsage(req, res) {
  const d = describeCompany(req.company);
  res.json({ plan: { key: d.plan, name: d.planInfo.name, price: d.planInfo.price, currency: d.planInfo.currency }, features: d.features, usage: await usageOverview() });
}
