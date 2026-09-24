import { ConversationLog } from '../models/index.js';
import { phoneFromJid, toJid } from '../utils/phone.js';
import { getSock } from './connection.js';

async function logOutgoing(jid, text, accountId = null) {
  const phone = phoneFromJid(toJid(jid));
  if (!phone) return;
  try {
    await ConversationLog.add({
      phone_number: phone,
      direction: 'outgoing',
      message_text: text || '',
      account_id: accountId || null,
    });
  } catch (err) {
    console.error('Conversation outgoing log failed:', err.message);
  }
}

function readySock(accountId) {
  const sock = getSock('admin') || getSock();
  if (!sock) {
    console.warn('WhatsApp send skipped — socket is not connected');
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

export async function sendText(jid, text, options = {}) {
  try {
    const accountId = options.accountId || null;
    const sock = options.sock || readySock(accountId);
    if (!sock) return false;
    const unique = destinationsFor(jid, options);
    let lastError = null;
    for (const to of unique) {
      try {
        await sock.sendMessage(to, { text: String(text) });
        await logOutgoing(to, String(text), accountId);
        return true;
      } catch (err) {
        lastError = err;
        console.error(`sendText failed to ${to}:`, err.message);
      }
    }
    if (lastError) console.error('sendText failed:', lastError.message);
    return false;
  } catch (err) {
    console.error('sendText failed:', err.message);
    return false;
  }
}

export async function sendImage(jid, imagePathOrBuffer, caption, options = {}) {
  try {
    const accountId = options.accountId || null;
    const sock = options.sock || readySock(accountId);
    if (!sock) return false;
    const unique = destinationsFor(jid, options);
    const image = Buffer.isBuffer(imagePathOrBuffer)
      ? imagePathOrBuffer
      : { url: imagePathOrBuffer };
    for (const to of unique) {
      try {
        await sock.sendMessage(to, { image, caption: caption || undefined });
        await logOutgoing(to, caption || '[image]', accountId);
        return true;
      } catch (err) {
        console.error(`sendImage failed to ${to}:`, err.message);
      }
    }
    return false;
  } catch (err) {
    console.error('sendImage failed:', err.message);
    return false;
  }
}
