import { formatDate, formatDateNice } from '../utils/mappers.js';
import { generateQrBuffer } from '../utils/generateToken.js';
import { Audit, ConversationState, Host, Settings, Visit } from '../models/index.js';
import { ORG_TIMEZONE } from '../utils/dateParse.js';
import { normalizePhone } from '../utils/phone.js';
import { formatVisitDate, formatVisitTime, t, visitTypeLabel } from './messages.js';
import { sendImage, sendText, sendTextToPhone, sendTextToPhoneDetailed } from './sendMessage.js';

async function locationLabel() {
  if (process.env.ORG_LOCATION) return process.env.ORG_LOCATION;
  const settings = await Settings.get().catch(() => null);
  return settings?.org_name || 'Botho Innovations';
}

// The visitor's chat language, remembered by the booking conversation.
async function visitorLang(phone) {
  const state = await ConversationState.findByPhone(phone, 0).catch(() => null);
  return state?.collected_data?.lang === 'tn' ? 'tn' : 'en';
}

function visitorPhoneOf(visit) {
  return visit.visitor_phone || visit.visitor_profile_phone || null;
}

// Remembers which WhatsApp message asked the host about this visit, so a reply quoting it
// decides this visit.
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
  return { phone };
}

function sendOpts(visit) {
  return { accountId: visit.host_account_id || null };
}

export async function notifyHostNewVisit(visit) {
  const host = visit.host_id ? await Host.findById(visit.host_id) : null;
  if (host?.status === 'blocked') {
    await Audit.add({
      actor: 'System',
      action: 'Host is blocked — notification skipped',
      details: `${visit.ref_number} → ${visit.host_name}`,
    });
    return { sent: false, reason: 'blocked' };
  }

  const phone = normalizePhone(host?.phone || visit.host_phone);
  const visitorPhone = normalizePhone(visitorPhoneOf(visit));
  if (!phone) {
    console.warn(`Host ${visit.host_name} has no phone — skipped WhatsApp notify`);
    return { sent: false, reason: 'no_phone' };
  }
  if (visitorPhone && phone === visitorPhone) {
    console.warn(`Host ${visit.host_name} phone matches the visitor — host notify skipped`);
    return { sent: false, reason: 'same_phone' };
  }

  const { sent, id } = await sendTextToPhoneDetailed(
    phone,
    [
      `Hello ${String(visit.host_name || '').split(' ')[0]}, you have a new visit request.`,
      '',
      `Visitor: ${visit.visitor_name}`,
      `Company: ${visit.visitor_company || '—'}`,
      `Purpose: ${visit.purpose}`,
      `Visit type: ${visitTypeLabel(visit.visit_type, 'en')}`,
      `Date: ${formatVisitDate(formatDate(visit.visit_date), 'en')}`,
      `Time: ${formatVisitTime(visit.visit_time, 'en')}`,
      `Reference: ${visit.ref_number}`,
      '',
      t('en', 'hostmsg.reply'),
    ].join('\n')
  );
  if (!sent) console.error(`Host WhatsApp notify failed for ${visit.host_name} ${phone} ${visit.ref_number}`);
  await rememberHostMessage(visit, id);
  return { sent, reason: sent ? null : 'send_failed' };
}

export async function notifyHostRescheduled(visit, previous) {
  const host = visit.host_id ? await Host.findById(visit.host_id) : null;
  const phone = normalizePhone(host?.phone || visit.host_phone);
  const visitorPhone = normalizePhone(visitorPhoneOf(visit));
  if (!phone || host?.status === 'blocked' || (visitorPhone && phone === visitorPhone)) return { sent: false };
  // The visit is pending again, so the host can answer this message the same way.
  const { sent, id } = await sendTextToPhoneDetailed(
    phone,
    [
      `Hello ${String(visit.host_name || '').split(' ')[0]}, ${visit.visitor_name} would like to move their visit.`,
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
  const host = visit.host_id ? await Host.findById(visit.host_id) : null;
  const phone = normalizePhone(host?.phone || visit.host_phone);
  const visitorPhone = normalizePhone(visitorPhoneOf(visit));
  if (!phone || host?.status === 'blocked' || (visitorPhone && phone === visitorPhone)) return { sent: false };
  const sent = await sendTextToPhone(
    phone,
    [
      `Hello ${String(visit.host_name || '').split(' ')[0]}, a visit has been cancelled by the visitor.`,
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
  await sendText(phone, t(lang, 'notify.submitted', { ref: visit.ref_number }), {
    accountId: visit.host_account_id || null,
    onlyTarget: true,
  });
}

export async function notifyVisitorApproved(visit) {
  const phone = visitorPhoneOf(visit);
  if (!phone) return;
  const lang = await visitorLang(phone);
  const caption = t(lang, 'notify.approved', {
    ref: visit.ref_number,
    host: visit.host_name,
    date: formatVisitDate(formatDate(visit.visit_date), lang),
    time: formatVisitTime(visit.visit_time, lang),
    type: visitTypeLabel(visit.visit_type, lang),
    location: await locationLabel(),
    pinLine: visit.pin ? t(lang, 'notify.pinLine', { pin: visit.pin }) : '',
  });

  if (!visit.qr_token) {
    await sendText(phone, caption, sendOpts(visit));
    return;
  }
  try {
    const png = await generateQrBuffer(visit.qr_token);
    const sent = await sendImage(phone, png, caption, sendOpts(visit));
    if (!sent) await sendText(phone, caption, sendOpts(visit));
  } catch (err) {
    console.error('QR delivery failed, sending text only:', err.message);
    await sendText(phone, caption, sendOpts(visit));
  }
}

export async function notifyVisitorRejected(visit) {
  const phone = visitorPhoneOf(visit);
  if (!phone) return;
  const lang = await visitorLang(phone);
  const date = formatVisitDate(formatDate(visit.visit_date), lang) || formatDateNice(visit.visit_date);
  await sendText(phone, t(lang, 'notify.rejected', { ref: visit.ref_number, date }), sendOpts(visit));
}

// An administrator decided in the panel: tell the host, so they are not asked for something
// already done.
export async function notifyHostAdminDecision(visit, decision) {
  const { phone } = await hostPhoneFor(visit);
  const visitorPhone = normalizePhone(visitorPhoneOf(visit));
  if (!phone || (visitorPhone && phone === visitorPhone)) return { sent: false };
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

// Check-in time, in the organisation's time zone.
export function checkInTime(usedAt) {
  const value = usedAt ? new Date(usedAt) : new Date();
  return new Intl.DateTimeFormat('en-GB', { timeZone: ORG_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(value);
}

// The visitor has been checked in at the gate: tell the host. Returns { sent, reason }.
export async function notifyHostArrival(visit) {
  const { phone, reason } = await hostPhoneFor(visit);
  if (!phone) return { sent: false, reason };
  const sent = await sendTextToPhone(
    phone,
    t('en', 'hostmsg.arrived', {
      visitor: visit.visitor_name,
      company: visit.visitor_company && visit.visitor_company !== '—' ? visit.visitor_company : '—',
      purpose: visit.purpose || '—',
      time: checkInTime(visit.used_at),
    })
  );
  return { sent, reason: sent ? null : 'WhatsApp send failed' };
}
