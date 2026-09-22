import {
  Audit,
  Host,
  Visit,
  Visitor,
} from '../models/index.js';
import { generatePin, generateQrToken, generateRef } from '../utils/generateToken.js';
import { formatDate } from '../utils/mappers.js';
import { normalizePhone } from '../utils/phone.js';
import {
  notifyHostDecisionResult,
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
  if (!visitor) visitor = await Visitor.findByName(name);
  if (!visitor) {
    visitor = await Visitor.create({ name, company, phone });
  } else {
    const fields = {};
    if (company && company !== '—') fields.company = company;
    if (phone && !visitor.phone) fields.phone = phone;
    if (visitor.name !== name) fields.name = name;
    if (Object.keys(fields).length) visitor = await Visitor.update(visitor.id, fields);
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
  if (notify) {
    await notifyVisitorSubmitted(full).catch((err) => console.error('Visitor submit notify failed:', err.message));
    await notifyHostNewVisit(full).catch((err) => console.error('Host notify failed:', err.message));
  }
  return full;
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
  const pin = approved ? generatePin() : visit.pin;
  const qr_token = approved ? generateQrToken() : visit.qr_token;
  await Visit.decide(visit.id, approved ? 'approved' : 'rejected', pin, qr_token);
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
  return { visit: full, alreadyDecided: false };
}

function todayStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function validatePass({ token, pin }) {
  const visit = token ? await Visit.findByToken(String(token).trim()) : await Visit.findByPin(String(pin || '').trim());
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
