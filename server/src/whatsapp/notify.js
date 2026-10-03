// WhatsApp notifications about a visit, sent from the current company's number: to the host (new
// request, reschedule, cancellation, arrival) and to the visitor (submitted, approved with QR and
// calendar invite, declined, checked in, checked out, reminder).
import { formatDate, formatDateNice } from '../utils/mappers.js';
import { generateQrBuffer } from '../utils/generateToken.js';
import { buildIcs } from '../utils/ics.js';
import { Audit, ConversationState, Host, Visit } from '../models/index.js';
import { currentCompanyProfile } from '../services/companyConfig.js';
import { normalizePhone } from '../utils/phone.js';
import { formatVisitDate, formatVisitTime, t, visitTypeLabel } from './messages.js';
import { ft } from './flowMessages.js';
import { sendDocument, sendImage, sendText, sendTextToPhone, sendTextToPhoneDetailed } from './sendMessage.js';

async function company() {
  return (await currentCompanyProfile().catch(() => null)) || { name: 'our office', settings: {}, features: {} };
}

function locationOf(profile) {
  const s = profile.settings || {};
  return [s.address, s.location].filter(Boolean).join(', ') || profile.name;
}

// The visitor's chat language, remembered by the conversation.
async function visitorLang(phone) {
  const state = await ConversationState.findByPhone(phone).catch(() => null);
  return state?.collected_data?.lang === 'tn' ? 'tn' : 'en';
}

function visitorPhoneOf(visit) {
  return visit.visitor_phone || visit.visitor_profile_phone || null;
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

async function rememberHostMessage(visit, messageId) {
  if (!messageId) return;
  await Visit.setHostMessageId(visit.id, messageId).catch((err) => console.error('Host message id not saved:', err.message));
}

// The host's WhatsApp number, or why a message cannot be sent to them.
async function hostPhoneFor(visit) {
  const host = visit.host_id ? await Host.findById(visit.host_id) : null;
  if (host?.status === 'blocked') return { reason: 'host is blocked' };
  const phone = normalizePhone(host?.phone || visit.host_phone);
  if (!phone) return { reason: 'host has no WhatsApp number' };
  const visitorPhone = normalizePhone(visitorPhoneOf(visit));
  if (visitorPhone && phone === visitorPhone) return { reason: 'host phone is the visitor phone' };
  return { phone, host };
}

function kindWord(visit) {
  return visit.kind === 'appointment' ? 'appointment' : 'visit';
}

export async function notifyHostNewVisit(visit) {
  const host = visit.host_id ? await Host.findById(visit.host_id) : null;
  if (host?.status === 'blocked') {
    await Audit.add({ actor: 'System', action: 'Host is blocked — notification skipped', details: `${visit.ref_number} → ${visit.host_name}` });
    return { sent: false, reason: 'blocked' };
  }
  const { phone, reason } = await hostPhoneFor(visit);
  if (!phone) return { sent: false, reason };
  const lines = [
    `Hello ${firstName(visit.host_name)}, you have a new ${kindWord(visit)} request.`,
    '',
    `Visitor: ${visit.visitor_name}`,
    `Company: ${visit.visitor_company || '—'}`,
    visit.kind === 'appointment' && visit.topic ? `Topic: ${visit.topic}` : `Purpose: ${visit.purpose}`,
    visit.kind === 'appointment' ? null : `Visit type: ${visitTypeLabel(visit.visit_type, 'en')}`,
    `Date: ${formatVisitDate(formatDate(visit.visit_date), 'en')}`,
    `Time: ${formatVisitTime(visit.visit_time, 'en')}`,
    `Reference: ${visit.ref_number}`,
    visit.flagged ? `⚠️ Flagged: ${visit.flag_reason}` : null,
    '',
    t('en', 'hostmsg.reply'),
  ].filter((line) => line !== null);
  const { sent, id } = await sendTextToPhoneDetailed(phone, lines.join('\n'));
  if (!sent) console.error(`Host WhatsApp notify failed for ${visit.host_name} ${visit.ref_number}`);
  await rememberHostMessage(visit, id);
  return { sent, reason: sent ? null : 'send_failed' };
}

export async function notifyHostRescheduled(visit, previous) {
  const { phone } = await hostPhoneFor(visit);
  if (!phone) return { sent: false };
  const { sent, id } = await sendTextToPhoneDetailed(
    phone,
    [
      `Hello ${firstName(visit.host_name)}, ${visit.visitor_name} would like to move their ${kindWord(visit)}.`,
      '',
      `From: ${formatVisitDate(previous.date, 'en')} at ${formatVisitTime(previous.time, 'en')}`,
      `To: ${formatVisitDate(formatDate(visit.visit_date), 'en')} at ${formatVisitTime(visit.visit_time, 'en')}`,
      `Company: ${visit.visitor_company || '—'}`,
      `Purpose: ${visit.purpose}`,
      `Reference: ${visit.ref_number}`,
      '',
      'You are free at the new time.',
      t('en', 'hostmsg.reply'),
    ].join('\n')
  );
  await rememberHostMessage(visit, id);
  return { sent };
}

export async function notifyHostCancelled(visit) {
  const { phone } = await hostPhoneFor(visit);
  if (!phone) return { sent: false };
  const sent = await sendTextToPhone(
    phone,
    [
      `Hello ${firstName(visit.host_name)}, a ${kindWord(visit)} has been cancelled by the visitor.`,
      '',
      `Visitor: ${visit.visitor_name}`,
      `Company: ${visit.visitor_company || '—'}`,
      `Date: ${formatVisitDate(formatDate(visit.visit_date), 'en')}`,
      `Time: ${formatVisitTime(visit.visit_time, 'en')}`,
      `Reference: ${visit.ref_number}`,
      '',
      'No action is needed. That time slot is free again.',
    ].join('\n')
  );
  return { sent };
}

export async function notifyVisitorSubmitted(visit) {
  const phone = visitorPhoneOf(visit);
  if (!phone) return;
  const lang = await visitorLang(phone);
  await sendText(phone, t(lang, 'notify.submitted', { ref: visit.ref_number }), { onlyTarget: true });
}

// The calendar invite for a visit or appointment.
export async function calendarInvite(visit, lang = 'en') {
  const profile = await company();
  const kind = visit.kind === 'appointment' ? 'appointment' : 'visit';
  const title = `${kind === 'appointment' ? 'Appointment' : 'Visit'} with ${visit.host_name} – ${profile.name}`;
  const buffer = buildIcs({
    uid: `${visit.ref_number}@vms`,
    title,
    description: `Reference: ${visit.ref_number}\nHost: ${visit.host_name}${visit.host_department ? ` (${visit.host_department})` : ''}\nPurpose: ${visit.purpose}${visit.pin && visit.status === 'approved' ? `\nPIN: ${visit.pin}` : ''}`,
    location: locationOf(profile),
    date: formatDate(visit.visit_date),
    time: String(visit.visit_time).slice(0, 5),
    timeZone: profile.settings?.timezone || 'Africa/Gaborone',
  });
  return {
    buffer,
    fileName: `${visit.ref_number}.ics`,
    mimetype: 'text/calendar',
    caption: ft(lang, 'notify.calendarCaption', { kind: ft(lang, kind === 'appointment' ? 'kind.appointment' : 'kind.visit').toLowerCase() }),
  };
}

export async function notifyVisitorApproved(visit) {
  const phone = visitorPhoneOf(visit);
  if (!phone) return;
  const lang = await visitorLang(phone);
  const profile = await company();
  const vars = {
    ref: visit.ref_number,
    host: visit.host_name,
    date: formatVisitDate(formatDate(visit.visit_date), lang),
    time: formatVisitTime(visit.visit_time, lang),
    type: visit.kind === 'appointment' ? ft(lang, 'kind.appointment') : visitTypeLabel(visit.visit_type, lang),
    location: locationOf(profile),
    pinLine: visit.pin ? t(lang, 'notify.pinLine', { pin: visit.pin }) : '',
    company: profile.name,
    pin: visit.pin || '',
  };
  const custom = profile.features?.white_label ? profile.settings?.templates?.approved?.[lang] : '';
  const caption = custom && custom.trim()
    ? custom.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? '' : String(vars[k])))
    : t(lang, 'notify.approved', vars);

  let sent = false;
  if (visit.qr_token) {
    try {
      const png = await generateQrBuffer(visit.qr_token);
      sent = await sendImage(phone, png, caption);
    } catch (err) {
      console.error('QR delivery failed, sending text only:', err.message);
    }
  }
  if (!sent) await sendText(phone, caption);
  // Appointments (and visits) get a calendar invite with a 1-hour alarm.
  try {
    const file = await calendarInvite(visit, lang);
    await sendDocument(phone, file.buffer, file);
  } catch (err) {
    console.error('Calendar invite failed:', err.message);
  }
}

export async function notifyVisitorRejected(visit) {
  const phone = visitorPhoneOf(visit);
  if (!phone) return;
  const lang = await visitorLang(phone);
  const date = formatVisitDate(formatDate(visit.visit_date), lang) || formatDateNice(visit.visit_date);
  await sendText(phone, t(lang, 'notify.rejected', { ref: visit.ref_number, date }));
}

export async function notifyVisitorCheckedIn(visit) {
  const phone = visitorPhoneOf(visit);
  if (!phone) return;
  const lang = await visitorLang(phone);
  const profile = await company();
  const wifi = profile.settings?.integrations?.wifi;
  const wifiLine =
    profile.features?.guest_wifi && wifi?.enabled && wifi.ssid ? ft(lang, 'notify.wifi', { ssid: wifi.ssid, password: wifi.password || '—' }) : '';
  await sendText(phone, ft(lang, 'notify.checkedIn', { company: profile.name, first: firstName(visit.visitor_name), host: visit.host_name, wifi: wifiLine }));
}

export async function notifyVisitorCheckedOut(visit) {
  const phone = visitorPhoneOf(visit);
  if (!phone) return;
  const lang = await visitorLang(phone);
  const profile = await company();
  if (profile.features?.feedback) {
    await sendText(phone, ft(lang, 'fb.offerAfterVisit', { company: profile.name }));
  } else {
    await sendText(phone, ft(lang, 'end.text', { company: profile.name }));
  }
}

export async function notifyVisitorReminder(visit) {
  const phone = visitorPhoneOf(visit);
  if (!phone) return false;
  const lang = await visitorLang(phone);
  return sendText(
    phone,
    ft(lang, 'notify.reminder', {
      kind: ft(lang, visit.kind === 'appointment' ? 'kind.appointment' : 'kind.visit').toLowerCase(),
      host: visit.host_name,
      time: formatVisitTime(visit.visit_time, lang),
      ref: visit.ref_number,
    })
  );
}

// An administrator decided in the panel: tell the host, so they are not asked for something
// already done.
export async function notifyHostAdminDecision(visit, decision) {
  const { phone } = await hostPhoneFor(visit);
  if (!phone) return { sent: false };
  const key = decision === 'approved' ? 'hostmsg.byAdminApproved' : 'hostmsg.byAdminDeclined';
  const sent = await sendTextToPhone(
    phone,
    t('en', key, {
      ref: visit.ref_number,
      visitor: visit.visitor_name,
      date: formatVisitDate(formatDate(visit.visit_date), 'en'),
      time: formatVisitTime(visit.visit_time, 'en'),
    })
  );
  return { sent };
}

// Check-in time, in the company's time zone.
export function checkInTime(usedAt, timeZone = process.env.ORG_TIMEZONE || 'Africa/Gaborone') {
  const value = usedAt ? new Date(usedAt) : new Date();
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(value);
}

// The visitor has been checked in at the gate: tell the host. Returns { sent, reason }.
export async function notifyHostArrival(visit) {
  const { phone, reason } = await hostPhoneFor(visit);
  if (!phone) return { sent: false, reason };
  const profile = await company();
  const sent = await sendTextToPhone(
    phone,
    t('en', 'hostmsg.arrived', {
      visitor: visit.visitor_name,
      company: visit.visitor_company && visit.visitor_company !== '—' ? visit.visitor_company : '—',
      purpose: visit.purpose || '—',
      time: checkInTime(visit.used_at, profile.settings?.timezone),
    })
  );
  return { sent, reason: sent ? null : 'WhatsApp send failed' };
}

// Staff updated a service request: tell the visitor.
export async function notifyServiceUpdate(request, statusLabelEn, statusLabelTn) {
  const phone = request.phone;
  if (!phone) return false;
  const lang = await visitorLang(phone);
  const note = request.staff_note ? `\n${lang === 'tn' ? 'Molaetsa' : 'Note'}: ${request.staff_note}` : '';
  return sendText(phone, ft(lang, 'svc.update', { ref: request.ref_number, status: lang === 'tn' ? statusLabelTn : statusLabelEn, noteLine: note }));
}
