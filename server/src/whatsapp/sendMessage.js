// Sending WhatsApp messages from the current company's linked number. The company comes from the
// tenant context (a panel request or an incoming message), so one company can never send from
// another company's number.
import { ConversationLog } from '../models/index.js';
import { meter } from '../services/metrics.js';
import { optionalTenantId } from '../tenant.js';
import { normalizePhone, phoneFromJid, toJid } from '../utils/phone.js';
import { getSock } from './connection.js';

async function logOutgoing(jid, text) {
  const phone = phoneFromJid(toJid(jid));
  if (!phone) return;
  meter('wa_messages_out');
  try {
    await ConversationLog.add({ phone_number: phone, direction: 'outgoing', message_text: text || '' });
  } catch (err) {
    console.error('Conversation outgoing log failed:', err.message);
  }
}

function readySock() {
  const companyId = optionalTenantId();
  const sock = companyId ? getSock(companyId) : null;
  if (!sock) {
    console.warn(`WhatsApp send skipped — company ${companyId || '?'} has no connected number`);
    return null;
  }
  return sock;
}

function destinationsFor(jid, options = {}) {
  const destinations = [];
  if (!options.onlyTarget && options.replyJid) destinations.push(options.replyJid);
  if (String(jid || '').includes('@')) destinations.push(String(jid));
  const converted = toJid(jid);
  if (converted) destinations.push(converted);
  return [...new Set(destinations.filter(Boolean))];
}

async function sendContent(jid, content, logText, options = {}) {
  try {
    const sock = options.sock || readySock();
    if (!sock) return false;
    for (const to of destinationsFor(jid, options)) {
      try {
        await sock.sendMessage(to, content);
        await logOutgoing(to, logText);
        return true;
      } catch (err) {
        console.error(`WhatsApp send failed to ${to}:`, err.message);
      }
    }
    return false;
  } catch (err) {
    console.error('WhatsApp send failed:', err.message);
    return false;
  }
}

export function sendText(jid, text, options = {}) {
  return sendContent(jid, { text: String(text) }, String(text), options);
}

export function sendImage(jid, imagePathOrBuffer, caption, options = {}) {
  const image = Buffer.isBuffer(imagePathOrBuffer) ? imagePathOrBuffer : { url: imagePathOrBuffer };
  return sendContent(jid, { image, caption: caption || undefined }, caption || '[image]', options);
}

// A file, e.g. a calendar invite (.ics).
export function sendDocument(jid, buffer, { fileName, mimetype, caption } = {}, options = {}) {
  return sendContent(jid, { document: buffer, fileName, mimetype, caption: caption || undefined }, caption || `[file] ${fileName}`, options);
}

export async function sendTextToPhone(phone, text, options = {}) {
  return (await sendTextToPhoneDetailed(phone, text, options)).sent;
}

// Like sendTextToPhone, but also returns the WhatsApp message id, so a reply that quotes this
// message can be matched to it.
export async function sendTextToPhoneDetailed(phone, text, options = {}) {
  const digits = normalizePhone(phone);
  if (!digits) return { sent: false, id: null };
  const sock = options.sock || readySock();
  if (!sock) return { sent: false, id: null };
  const destinations = [];
  try {
    if (typeof sock.onWhatsApp === 'function') {
      const found = await sock.onWhatsApp(digits);
      const jid = found?.[0]?.jid;
      if (jid) destinations.push(jid);
    }
  } catch (err) {
    console.warn('onWhatsApp lookup failed:', err.message);
  }
  destinations.push(`${digits}@s.whatsapp.net`);
  for (const to of [...new Set(destinations.filter(Boolean))]) {
    try {
      const sent = await sock.sendMessage(to, { text: String(text) });
      await logOutgoing(to, String(text));
      return { sent: true, id: sent?.key?.id || null };
    } catch (err) {
      console.error(`sendTextToPhone failed to ${to}:`, err.message);
    }
  }
  return { sent: false, id: null };
}
