// Visits and appointments of the current company: create, decide, cancel, reschedule, check in at
// the gate and check out. Every visitor/host notification goes out from the company's own number.
import { Audit, ConversationLog, ConversationState, Document, Host, Visit, Visitor } from '../models/index.js';
import { generatePin, generateQrToken, generateRef } from '../utils/generateToken.js';
import { formatDate } from '../utils/mappers.js';
import { normalizePhone } from '../utils/phone.js';
import { todayStamp } from '../utils/dateParse.js';
import { withUniqueRef } from '../utils/refs.js';
import { notifySlack } from './slack.js';
import {
  notifyHostAdminDecision,
  notifyHostArrival,
  notifyHostCancelled,
  notifyHostRescheduled,
  notifyHostNewVisit,
  notifyVisitorApproved,
  notifyVisitorCheckedIn,
  notifyVisitorCheckedOut,
  notifyVisitorRejected,
  notifyVisitorSubmitted,
} from '../whatsapp/notify.js';

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export async function createPendingVisit({
  name,
  company = '—',
  hostId,
  hostName,
  purpose = '—',
  date,
  time = '—',
  visitType = 'official',
  visitorPhone,
  kind = 'visit',
  appointmentType = '',
  topic = '',
  flagged = false,
  flagReason = '',
  screening = {},
  idDocId = null,
  actor = 'WhatsApp',
  notify = true,
  notifyVisitor = true,
  notifyHost = true,
}) {
  const host = hostId ? await Host.findById(hostId) : await Host.findByName(hostName);
  if (!host) throw httpError(400, 'Host not found');
  if (!name || !date) throw httpError(400, 'Visitor name and date are required');

  const phone = visitorPhone ? normalizePhone(visitorPhone) : null;
  let visitor = phone ? await Visitor.findByPhone(phone) : null;
  if (!visitor) {
    visitor = await Visitor.create({ name, company, phone });
  } else {
    const fields = {};
    if (name && name !== visitor.name) fields.name = name;
    if (company && company !== '—' && company !== visitor.company) fields.company = company;
    if (phone && !visitor.phone) fields.phone = phone;
    if (Object.keys(fields).length) visitor = await Visitor.update(visitor.id, fields);
  }

  const cleanScreening = Object.fromEntries(Object.entries(screening || {}).filter(([, v]) => v !== undefined));
  const created = await withUniqueRef('VMS', () =>
    Visit.create({
      ref_number: generateRef(),
      visitor_id: visitor.id,
      host_id: host.id,
      purpose,
      visit_date: date,
      visit_time: time,
      status: 'pending',
      visit_type: visitType === 'social' ? 'social' : 'official',
      visitor_phone: phone,
      kind,
      appointment_type: appointmentType,
      topic,
      flagged,
      flag_reason: flagReason,
      screening: cleanScreening,
    })
  );
  if (idDocId) await Document.linkVisit(idDocId, created.id).catch((err) => console.error('ID link failed:', err.message));

  await Audit.add({
    actor,
    action: kind === 'appointment' ? 'Created appointment request' : 'Created visit request',
    details: `${name} → ${host.name} (${created.ref_number})${flagged ? ` · flagged: ${flagReason}` : ''}`,
  });

  const full = await Visit.findById(created.id);
  let hostNotify = { sent: false, reason: 'skipped' };
  if (notify && notifyVisitor) {
    await notifyVisitorSubmitted(full).catch((err) => console.error('Visitor submit notify failed:', err.message));
  }
  if (notify && notifyHost) {
    hostNotify = await notifyHostNewVisit(full).catch((err) => {
      console.error('Host notify failed:', err.message);
      return { sent: false, reason: err.message };
    });
  }
  notifySlack(
    'newVisit',
    `🆕 New ${kind === 'appointment' ? 'appointment' : 'visit'} request ${full.ref_number}: ${full.visitor_name} → ${full.host_name}, ${formatDate(full.visit_date)} ${full.visit_time}${flagged ? ` ⚠️ ${flagReason}` : ''}`
  ).catch(() => {});
  full.hostNotify = hostNotify;
  if (phone) {
    await ConversationLog.linkVisit(phone, created.id).catch((err) => console.error('Conversation log link failed:', err.message));
  }
  return full;
}

function ownedBy(visit, visitorPhone) {
  const owner = normalizePhone(visit.visitor_phone || visit.visitor_profile_phone);
  return Boolean(owner) && owner === normalizePhone(visitorPhone);
}

// A visitor cancels their own upcoming visit from WhatsApp. The pass stops working because
// validation only accepts approved visits.
export async function cancelVisitByVisitor({ ref, visitorPhone }) {
  const visit = await Visit.findByRef(ref);
  if (!visit) return { ok: false, reason: 'not_found' };
  if (!ownedBy(visit, visitorPhone)) return { ok: false, reason: 'not_owner' };
  if (!['pending', 'approved'].includes(visit.status)) return { ok: false, reason: 'not_open', status: visit.status };

  await Visit.setStatus(visit.id, 'cancelled');
  await Audit.add({
    actor: visit.visitor_name || 'Visitor',
    action: 'Cancelled visit',
    details: `${visit.ref_number} — ${visit.visitor_name} → ${visit.host_name} (cancelled by visitor on WhatsApp)`,
  });
  const full = await Visit.findById(visit.id);
  await notifyHostCancelled(full).catch((err) => console.error('Host cancel notify failed:', err.message));
  return { ok: true, ref: full.ref_number, hostName: full.host_name };
}

// A visitor moves their own upcoming visit. The slot is re-checked against live data, the visit goes
// back to pending for the host to approve, and the host is told about the change.
export async function rescheduleVisitByVisitor({ ref, visitorPhone, date, time }) {
  const visit = await Visit.findByRef(ref);
  if (!visit) return { ok: false, reason: 'not_found' };
  if (!ownedBy(visit, visitorPhone)) return { ok: false, reason: 'not_owner' };
  if (!['pending', 'approved'].includes(visit.status)) return { ok: false, reason: 'not_open', status: visit.status };

  const open = await Visit.listOpenFrom(date);
  const taken = (open || []).some((b) => {
    if (b.ref_number === visit.ref_number || Number(b.host_id) !== Number(visit.host_id)) return false;
    if (formatDate(b.visit_date) !== date) return false;
    const [h1, m1] = String(b.visit_time).slice(0, 5).split(':').map(Number);
    const [h2, m2] = String(time).split(':').map(Number);
    return Math.abs(h1 * 60 + m1 - (h2 * 60 + m2)) < 30;
  });
  const base = { ref: visit.ref_number, hostId: visit.host_id, hostName: visit.host_name, date, time };
  if (taken) return { ok: false, reason: 'slot_taken', ...base };

  const previous = { date: formatDate(visit.visit_date), time: String(visit.visit_time).slice(0, 5) };
  await Visit.reschedule(visit.id, date, time);
  await Audit.add({
    actor: visit.visitor_name || 'Visitor',
    action: 'Rescheduled visit',
    details: `${visit.ref_number} — ${previous.date} ${previous.time} → ${date} ${time} (by visitor on WhatsApp)`,
  });
  const full = await Visit.findById(visit.id);
  await notifyHostRescheduled(full, previous).catch((err) => console.error('Host reschedule notify failed:', err.message));
  return { ok: true, ...base };
}

// The one way a visit is approved or declined: from the admin panel ('panel') or by the host
// replying on WhatsApp ('whatsapp'). Only the first decision applies; a later one gets
// { alreadyDecided: true } with the visit as it now is.
export async function decideVisit({ visitId, decision, actor = 'Host', actorHostId = null, via = 'panel' }) {
  const visit = await Visit.findById(visitId);
  if (!visit) throw httpError(404, 'Visit not found');
  if (actorHostId && Number(actorHostId) !== Number(visit.host_id)) throw httpError(403, 'Forbidden');
  if (visit.status !== 'pending') return { visit, alreadyDecided: true };

  const approved = decision === 'approved';
  const qr_token = approved ? generateQrToken() : visit.qr_token;
  let pin = visit.pin;
  if (approved) {
    pin = generatePin();
    for (let i = 0; i < 6; i += 1) {
      const taken = await Visit.findByPin(pin);
      if (!taken || Number(taken.id) === Number(visit.id)) break;
      pin = generatePin();
    }
  }
  const decided = await Visit.decide(visit.id, approved ? 'approved' : 'rejected', qr_token, pin, actor);
  if (!decided) return { visit: await Visit.findById(visit.id), alreadyDecided: true };
  await Audit.add({
    actor,
    action: approved ? 'Approved visit' : 'Rejected visit',
    details: `${visit.ref_number} — ${visit.visitor_name}${via === 'whatsapp' ? ' (by the host on WhatsApp)' : ''}`,
  });

  const full = await Visit.findById(visit.id);
  if (approved) await notifyVisitorApproved(full).catch((err) => console.error('Visitor approve notify failed:', err.message));
  else await notifyVisitorRejected(full).catch((err) => console.error('Visitor reject notify failed:', err.message));
  if (via === 'panel') {
    await notifyHostAdminDecision(full, approved ? 'approved' : 'rejected').catch((err) =>
      console.error('Host admin-decision notice failed:', err.message)
    );
  }
  const visitorPhone = full.visitor_phone || full.visitor_profile_phone;
  if (visitorPhone) await ConversationLog.linkVisit(visitorPhone, full.id).catch(() => {});
  return { visit: full, alreadyDecided: false };
}

function gateVisit(full) {
  return {
    visitor: { name: full.visitor_name, company: full.visitor_company },
    visit: {
      id: full.id,
      ref: full.ref_number,
      host: full.host_name,
      department: full.host_department,
      date: formatDate(full.visit_date),
      time: full.visit_time,
      purpose: full.purpose,
      kind: full.kind || 'visit',
      pin: full.pin,
      status: full.status,
      flagged: Boolean(full.flagged),
      flagReason: full.flag_reason || '',
      usedAt: full.used_at,
      checkedOutAt: full.checked_out_at,
    },
  };
}

export async function validatePass({ token, pin, actor = 'Security gate' }) {
  const visit = token ? await Visit.findByToken(String(token).trim()) : pin ? await Visit.findByPin(String(pin).trim()) : null;
  if (!visit) return { ok: false, reason: 'not_found', error: 'Pass not found' };
  if (visit.status !== 'approved') {
    if (visit.status === 'used' || visit.used_at) {
      return { ok: false, reason: 'already_used', error: 'This pass has already been used', ...gateVisit(visit) };
    }
    return { ok: false, reason: 'not_approved', error: `This visit is ${visit.status}` };
  }
  if (visit.used_at) return { ok: false, reason: 'already_used', error: 'This pass has already been used' };
  const visitDate = formatDate(visit.visit_date);
  if (visitDate && visitDate < todayStamp()) return { ok: false, reason: 'expired', error: 'This pass has expired' };
  if (visitDate && visitDate > todayStamp()) {
    return { ok: false, reason: 'not_today', error: `This pass is for ${visitDate}, not today`, ...gateVisit(visit) };
  }

  const used = await Visit.markUsed(visit.id);
  if (!used) return { ok: false, reason: 'already_used', error: 'This pass has already been used' };
  const full = await Visit.findById(used.id);
  await Audit.add({ actor, action: 'Validated pass', details: `${full.ref_number} — ${full.visitor_name}` });

  // Tell the host their visitor has arrived, and welcome the visitor. The check-in stands even if these fail.
  const alert = await notifyHostArrival(full).catch((err) => ({ sent: false, reason: err.message }));
  if (!alert.sent) {
    await Audit.add({
      actor: 'System',
      action: 'Arrival alert not sent',
      details: `${full.ref_number} — ${full.visitor_name} → ${full.host_name}: ${alert.reason || 'unknown reason'}`,
    }).catch(() => {});
  }
  await notifyVisitorCheckedIn(full).catch((err) => console.error('Visitor check-in notify failed:', err.message));
  notifySlack('checkIn', `✅ ${full.visitor_name} checked in to see ${full.host_name} (${full.ref_number})`).catch(() => {});
  return { ok: true, ...gateVisit(full), hostNotified: Boolean(alert.sent) };
}

// The visitor leaves: the gate checks them out, and the visitor is offered a feedback form.
export async function checkOutVisit({ visitId, actor = 'Security gate' }) {
  const visit = await Visit.findById(visitId);
  if (!visit) throw httpError(404, 'Visit not found');
  if (visit.status !== 'used') throw httpError(400, 'This visitor has not checked in.');
  if (visit.checked_out_at) throw httpError(400, 'This visitor has already checked out.');
  const done = await Visit.checkOut(visit.id);
  if (!done) throw httpError(400, 'This visitor has already checked out.');
  const full = await Visit.findById(visit.id);
  await Audit.add({ actor, action: 'Checked out visitor', details: `${full.ref_number} — ${full.visitor_name}` });
  const phone = full.visitor_phone || full.visitor_profile_phone;
  if (phone) {
    await offerFeedback(phone, full).catch((err) => console.error('Feedback offer state failed:', err.message));
    await notifyVisitorCheckedOut(full).catch((err) => console.error('Visitor check-out notify failed:', err.message));
  }
  return gateVisit(full);
}

// The next reply from the visitor answers "Would you like to give feedback on your visit?".
async function offerFeedback(phone, visit) {
  const current = await ConversationState.findByPhone(phone);
  const saved = current?.collected_data || {};
  if (saved.step === 'handover') return;
  const state = {
    v: 2,
    lang: saved.lang || null,
    step: 'fb.offer',
    data: { visitId: visit.id },
    stack: [],
    lastAt: Date.now(),
    savedAt: Date.now(),
  };
  await ConversationState.upsert(phone, 'fb.offer', state);
  const { forgetLiveState } = await import('../whatsapp/flowAgent.js');
  forgetLiveState(phone);
}
