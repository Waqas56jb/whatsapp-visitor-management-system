import { formatDate, formatDateNice } from '../utils/mappers.js';
import { generateQrBuffer } from '../utils/generateToken.js';
import { Settings } from '../models/index.js';
import { sendImage, sendInteractiveButtons, sendText, uploadMedia } from './client.js';

async function locationLabel() {
  if (process.env.ORG_LOCATION) return process.env.ORG_LOCATION;
  const settings = await Settings.get().catch(() => null);
  return settings?.org_name || 'Botho Innovations';
}

export async function notifyHostNewVisit(visit) {
  const phone = visit.host_phone;
  if (!phone) {
    console.warn(`Host ${visit.host_name} has no phone — skipped WhatsApp notify`);
    return;
  }

  const body = [
    'New visitor request',
    '',
    `Visitor: ${visit.visitor_name}`,
    `Company: ${visit.visitor_company || '—'}`,
    `Purpose: ${visit.purpose}`,
    `Date: ${formatDateNice(visit.visit_date)}`,
    `Time: ${visit.visit_time}`,
    `Type: ${visit.visit_type === 'social' ? 'Social' : 'Official'}`,
    `Host: ${visit.host_name}`,
    `Reference: ${visit.ref_number}`,
    '',
    'Tap a button to respond.',
  ].join('\n');

  await sendInteractiveButtons(phone, body, [
    { id: `approve_${visit.id}`, title: 'Approve' },
    { id: `reject_${visit.id}`, title: 'Reject' },
  ]);
}

export async function notifyVisitorSubmitted(visit) {
  const phone = visit.visitor_phone || visit.visitor_profile_phone;
  if (!phone) return;
  await sendText(
    phone,
    [
      'Request submitted.',
      `Reference: ${visit.ref_number}`,
      'Status: Pending Host Approval.',
      '',
      'You will receive a notification once the host responds.',
      'Thank you for using Botho Innovations Visitor Management.',
    ].join('\n')
  );
}

export async function notifyVisitorApproved(visit) {
  const phone = visit.visitor_phone || visit.visitor_profile_phone;
  if (!phone) return;

  const location = await locationLabel();
  const text = [
    'Your visit has been approved!',
    `Host: ${visit.host_name}`,
    `Date: ${formatDateNice(visit.visit_date) || formatDate(visit.visit_date)}`,
    `Time: ${visit.visit_time}`,
    `Location: ${location}.`,
    `Your PIN: ${visit.pin}`,
    '',
    'Present the QR code at the security gate or share the PIN.',
  ].join('\n');

  await sendText(phone, text);

  if (!visit.qr_token) return;
  try {
    const png = await generateQrBuffer(visit.qr_token);
    const mediaId = await uploadMedia(png, `pass-${visit.ref_number}.png`);
    if (mediaId) {
      await sendImage(phone, { mediaId, caption: `${visit.ref_number} · PIN ${visit.pin}` });
    }
  } catch (err) {
    console.error('QR delivery failed, visitor still has the PIN:', err.message);
  }
}

export async function notifyVisitorRejected(visit) {
  const phone = visit.visitor_phone || visit.visitor_profile_phone;
  if (!phone) return;
  const date = formatDateNice(visit.visit_date) || formatDate(visit.visit_date) || 'your requested date';
  await sendText(phone, `We're sorry, your visit request for ${date} has been declined by the host.`);
}

export async function notifyHostDecisionResult(hostPhone, visit, decision) {
  if (!hostPhone) return;
  if (decision === 'approved') {
    await sendText(
      hostPhone,
      `Approved.\n${visit.visitor_name} will be notified automatically.\nReference: ${visit.ref_number}`
    );
  } else {
    await sendText(
      hostPhone,
      `Rejected.\n${visit.visitor_name} will be notified automatically.\nReference: ${visit.ref_number}`
    );
  }
}
