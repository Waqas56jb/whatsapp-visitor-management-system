import { ConversationLog } from '../models/index.js';
import { phoneFromJid, toJid } from '../utils/phone.js';
import { getSock, getSockForAccount } from './connection.js';

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
  const sock = accountId ? getSockForAccount(accountId) : getSock();
  if (!sock) {
    console.warn('WhatsApp send skipped — socket is not connected');
    return null;
  }
  return sock;
}

export async function sendText(jid, text, options = {}) {
  try {
    const accountId = options.accountId || null;
    const sock = options.sock || readySock(accountId);
    if (!sock) return false;
    const to = toJid(jid);
    if (!to) return false;
    await sock.sendMessage(to, { text: String(text) });
    await logOutgoing(to, String(text), accountId);
    return true;
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
    const to = toJid(jid);
    if (!to) return false;
    const image = Buffer.isBuffer(imagePathOrBuffer)
      ? imagePathOrBuffer
      : { url: imagePathOrBuffer };
    await sock.sendMessage(to, { image, caption: caption || undefined });
    await logOutgoing(to, caption || '[image]', accountId);
    return true;
  } catch (err) {
    console.error('sendImage failed:', err.message);
    return false;
  }
}
