import { formatDate, formatDateNice } from '../utils/mappers.js';
import { generateQrBuffer } from '../utils/generateToken.js';
import { Audit, Host, Settings } from '../models/index.js';
import { sendImage, sendText } from './sendMessage.js';

async function locationLabel() {
  if (process.env.ORG_LOCATION) return process.env.ORG_LOCATION;
  const settings = await Settings.get().catch(() => null);
  return settings?.org_name || 'Botho Innovations';
}

export async function notifyHostNewVisit(visit) {
  const host = visit.host_id ? await Host.findById(visit.host_id) : null;
  if (host?.status === 'blocked') {
    await Audit.add({
      actor: 'System',
      action: 'Host is blocked — notification skipped',
      details: `${visit.ref_number} → ${visit.host_name}`,
    });
    return;
  }

  const phone = visit.host_phone;
  if (!phone) {
    console.warn(`Host ${visit.host_name} has no phone — skipped WhatsApp notify`);
    return;
  }

  const accountId = host?.account_id || null;
  await sendText(
    phone,
    [
      '🔔 New visit request',
      `Visitor: ${visit.visitor_name}`,
      `Company: ${visit.visitor_company || '—'}`,
      `Type: ${visit.visit_type === 'social' ? 'Social' : 'Official'}`,
      `Purpose: ${visit.purpose}`,
      `Date: ${formatDateNice(visit.visit_date)} at ${visit.visit_time}`,
      `Reference: ${visit.ref_number}`,
      '',
      `Reply APPROVE ${visit.ref_number} or REJECT ${visit.ref_number}`,
    ].join('\n'),
    { accountId }
  );
}

export async function notifyVisitorSubmitted(visit) {
  const phone = visit.visitor_phone || visit.visitor_profile_phone;
  if (!phone) return;
  await sendText(
    phone,
    [
      '✅ Request submitted!',
      `Reference: ${visit.ref_number}`,
      'Status: Pending host approval.',
      "You'll be notified here once your host responds.",
    ].join('\n'),
    { accountId: visit.host_account_id || null }
  );
}

function sendOpts(visit) {
  return { accountId: visit.host_account_id || null };
}

export async function notifyVisitorApproved(visit) {
  const phone = visit.visitor_phone || visit.visitor_profile_phone;
  if (!phone) return;

  const location = await locationLabel();
  const caption = [
    '✅ Your visit has been approved!',
    `Host: ${visit.host_name}`,
    `Date: ${formatDateNice(visit.visit_date) || formatDate(visit.visit_date)}`,
    `Time: ${visit.visit_time}`,
    `Location: ${location}`,
    visit.pin ? `Backup PIN: ${visit.pin}` : null,
    'Show this QR at reception, or enter the PIN if the camera cannot scan.',
  ]
    .filter(Boolean)
    .join('\n');

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
  const phone = visit.visitor_phone || visit.visitor_profile_phone;
  if (!phone) return;
  const date = formatDateNice(visit.visit_date) || formatDate(visit.visit_date) || 'your requested date';
  await sendText(
    phone,
    `We're sorry, your visit request for ${date} has been declined by the host.`,
    sendOpts(visit)
  );
}

export async function notifyHostDecisionResult(hostPhone, visit, decision) {
  if (!hostPhone) return;
  const text =
    decision === 'approved'
      ? `✅ Approved. ${visit.visitor_name} will be notified automatically.\nReference: ${visit.ref_number}`
      : `Request rejected. ${visit.visitor_name} will be notified automatically.\nReference: ${visit.ref_number}`;
  await sendText(hostPhone, text, sendOpts(visit));
}
