import {
  Audit,
  ConversationLog,
  Host,
  Visit,
  Visitor,
} from '../models/index.js';
import { generatePin, generateQrToken, generateRef } from '../utils/generateToken.js';
import { formatDate } from '../utils/mappers.js';
import { normalizePhone } from '../utils/phone.js';
import {
  notifyHostCancelled,
  notifyHostDecisionResult,
  notifyHostRescheduled,
  notifyHostNewVisit,
  notifyVisitorApproved,
  notifyVisitorRejected,
  notifyVisitorSubmitted,
} from '../whatsapp/notify.js';

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
  actor = 'WhatsApp',
  notify = true,
  notifyVisitor = true,
  notifyHost = true,
}) {
  const host = hostId ? await Host.findById(hostId) : await Host.findByName(hostName);
  if (!host) {
    const err = new Error('Host not found');
    err.status = 400;
    throw err;
  }
  if (!name || !date) {
    const err = new Error('Visitor name and date are required');
    err.status = 400;
    throw err;
  }

  const phone = visitorPhone ? normalizePhone(visitorPhone) : null;
  let visitor = phone ? await Visitor.findByPhone(phone) : null;
  if (!visitor) {
    visitor = await Visitor.create({ name, company, phone });
  } else {
    const fields = { name };
    if (company && company !== '—') fields.company = company;
    if (phone && !visitor.phone) fields.phone = phone;
    visitor = await Visitor.update(visitor.id, fields);
  }

  const created = await Visit.create({
    ref_number: generateRef(),
    visitor_id: visitor.id,
    host_id: host.id,
    purpose,
    visit_date: date,
    visit_time: time,
    status: 'pending',
    visit_type: visitType === 'social' ? 'social' : 'official',
    visitor_phone: phone,
  });

  await Audit.add({
    actor,
    action: 'Created visit request',
    details: `${name} → ${host.name} (${created.ref_number})`,
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
  full.hostNotify = hostNotify;
  if (phone) {
    await ConversationLog.linkVisit(phone, created.id).catch((err) =>
      console.error('Conversation log link failed:', err.message)
    );
  }
  return full;
}

// A visitor cancels their own upcoming visit from WhatsApp. The pass stops working because
// validation only accepts approved visits.
export async function cancelVisitByVisitor({ ref, visitorPhone }) {
  const visit = await Visit.findByRef(ref);
  if (!visit) return { ok: false, reason: 'not_found' };
  const owner = normalizePhone(visit.visitor_phone || visit.visitor_profile_phone);
  if (!owner || owner !== normalizePhone(visitorPhone)) return { ok: false, reason: 'not_owner' };
  if (!['pending', 'approved'].includes(visit.status)) return { ok: false, reason: 'not_open' };

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
  const owner = normalizePhone(visit.visitor_phone || visit.visitor_profile_phone);
  if (!owner || owner !== normalizePhone(visitorPhone)) return { ok: false, reason: 'not_owner' };
  if (!['pending', 'approved'].includes(visit.status)) return { ok: false, reason: 'not_open' };

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

export async function decideVisit({ visitId, decision, actor = 'Host', actorHostId = null, notifyHostPhone = null }) {
  const visit = await Visit.findById(visitId);
  if (!visit) {
    const err = new Error('Visit not found');
    err.status = 404;
    throw err;
  }
  if (actorHostId && Number(actorHostId) !== Number(visit.host_id)) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  if (visit.status !== 'pending') {
    return { visit, alreadyDecided: true };
  }

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
  await Visit.decide(visit.id, approved ? 'approved' : 'rejected', qr_token, pin);
  await Audit.add({
    actor,
    action: approved ? 'Approved visit' : 'Rejected visit',
    details: `${visit.ref_number} — ${visit.visitor_name}`,
  });

  const full = await Visit.findById(visit.id);
  if (approved) {
    await notifyVisitorApproved(full).catch((err) => console.error('Visitor approve notify failed:', err.message));
  } else {
    await notifyVisitorRejected(full).catch((err) => console.error('Visitor reject notify failed:', err.message));
  }
  if (notifyHostPhone) {
    await notifyHostDecisionResult(notifyHostPhone, full, approved ? 'approved' : 'rejected').catch((err) =>
      console.error('Host decision ack failed:', err.message)
    );
  }
  const visitorPhone = full.visitor_phone || full.visitor_profile_phone;
  if (visitorPhone) {
    await ConversationLog.linkVisit(visitorPhone, full.id).catch((err) =>
      console.error('Conversation log link failed:', err.message)
    );
  }
  return { visit: full, alreadyDecided: false };
}

export async function decideVisitByRef({ ref, decision, actorPhone, actorHostId = null, notifyHostPhone }) {
  const visit = await Visit.findByRef(ref);
  if (!visit) return { error: 'I could not find that visit reference.' };
  const host = actorHostId ? await Host.findById(actorHostId) : await Host.findByPhone(actorPhone);
  if (!host || Number(host.id) !== Number(visit.host_id)) {
    return { error: 'This request belongs to another host.' };
  }
  return decideVisit({
    visitId: visit.id,
    decision,
    actor: host.name,
    actorHostId: visit.host_id,
    notifyHostPhone: notifyHostPhone === undefined ? actorPhone : notifyHostPhone,
  });
}

function todayStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function validatePass({ token, pin }) {
  const visit = token
    ? await Visit.findByToken(String(token).trim())
    : pin
      ? await Visit.findByPin(String(pin).trim())
      : null;
  if (!visit) {
    return { ok: false, reason: 'not_found', error: 'Pass not found' };
  }
  if (visit.status !== 'approved') {
    if (visit.status === 'used' || visit.used_at) {
      return { ok: false, reason: 'already_used', error: 'This pass has already been used' };
    }
    return { ok: false, reason: 'not_approved', error: `This visit is ${visit.status}` };
  }
  if (visit.used_at) {
    return { ok: false, reason: 'already_used', error: 'This pass has already been used' };
  }
  const visitDate = formatDate(visit.visit_date);
  if (visitDate && visitDate < todayStamp()) {
    return { ok: false, reason: 'expired', error: 'This pass has expired' };
  }

  const used = await Visit.markUsed(visit.id);
  const full = await Visit.findById(used.id);
  await Audit.add({
    actor: 'Security gate',
    action: 'Validated pass',
    details: `${full.ref_number} — ${full.visitor_name}`,
  });

  return {
    ok: true,
    visitor: {
      name: full.visitor_name,
      company: full.visitor_company,
    },
    visit: {
      id: full.id,
      ref: full.ref_number,
      host: full.host_name,
      department: full.host_department,
      date: formatDate(full.visit_date),
      time: full.visit_time,
      purpose: full.purpose,
      pin: full.pin,
      status: 'used',
    },
  };
}
