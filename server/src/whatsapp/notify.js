import { formatDate, formatDateNice } from '../utils/mappers.js';
import { generateQrBuffer } from '../utils/generateToken.js';
import { Audit, ConversationState, Host, Settings } from '../models/index.js';
import { normalizePhone } from '../utils/phone.js';
import { formatVisitDate, formatVisitTime, t } from './messages.js';
import { sendImage, sendText, sendTextToPhone } from './sendMessage.js';

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

// Opens the Client Portal sign-in straight on Visit requests (client route /portal).
export function portalRequestsLink() {
  const base = String(process.env.CLIENT_PORTAL_URL || process.env.CLIENT_ORIGIN || '').split(',')[0].trim().replace(/\/$/, '');
  return base ? `${base}/portal` : '';
}

function visitorPhoneOf(visit) {
  return visit.visitor_phone || visit.visitor_profile_phone || null;
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

  const portal = portalRequestsLink();
  const sent = await sendTextToPhone(
    phone,
    [
      `Hello ${String(visit.host_name || '').split(' ')[0]}, you have a new visit request.`,
      '',
      `Visitor: ${visit.visitor_name}`,
      `Company: ${visit.visitor_company || '—'}`,
      `Purpose: ${visit.purpose}`,
      `Date: ${formatVisitDate(formatDate(visit.visit_date), 'en')}`,
      `Time: ${formatVisitTime(visit.visit_time, 'en')}`,
      `Reference: ${visit.ref_number}`,
      '',
      portal
        ? `Please open the Client Portal to approve or reject it:\n${portal}`
        : 'Please open the Client Portal → Visit requests to approve or reject it.',
    ].join('\n')
  );
  if (!sent) console.error(`Host WhatsApp notify failed for ${visit.host_name} ${phone} ${visit.ref_number}`);
  return { sent, reason: sent ? null : 'send_failed' };
}

export async function notifyHostRescheduled(visit, previous) {
  const host = visit.host_id ? await Host.findById(visit.host_id) : null;
  const phone = normalizePhone(host?.phone || visit.host_phone);
  const visitorPhone = normalizePhone(visitorPhoneOf(visit));
  if (!phone || host?.status === 'blocked' || (visitorPhone && phone === visitorPhone)) return { sent: false };
  const portal = portalRequestsLink();
  const sent = await sendTextToPhone(
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
      'You are free at the new time. Please approve or reject it in the Client Portal:',
      portal || 'Client Portal → Visit requests',
    ].join('\n')
  );
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

export async function notifyHostDecisionResult(hostPhone, visit, decision) {
  if (!hostPhone) return;
  const text =
    decision === 'approved'
      ? `Approved. ${visit.visitor_name} will be notified automatically.\nReference: ${visit.ref_number}`
      : `Rejected. ${visit.visitor_name} will be notified automatically.\nReference: ${visit.ref_number}`;
  await sendText(hostPhone, text, { ...sendOpts(visit), onlyTarget: true });
}
