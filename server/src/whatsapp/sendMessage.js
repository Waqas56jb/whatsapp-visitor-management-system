import { ConversationLog } from '../models/index.js';
import { phoneFromJid, toJid } from '../utils/phone.js';
import { getSock } from './connection.js';

async function logOutgoing(jid, text) {
  const phone = phoneFromJid(toJid(jid));
  if (!phone) return;
  try {
    await ConversationLog.add({
      phone_number: phone,
      direction: 'outgoing',
      message_text: text || '',
    });
  } catch (err) {
    console.error('Conversation outgoing log failed:', err.message);
  }
}

function readySock() {
  const sock = getSock();
  if (!sock) {
    console.warn('WhatsApp send skipped — socket is not connected');
    return null;
  }
  return sock;
}

export async function sendText(jid, text) {
  try {
    const sock = readySock();
    if (!sock) return false;
    const to = toJid(jid);
    if (!to) return false;
    await sock.sendMessage(to, { text: String(text) });
    await logOutgoing(to, String(text));
    return true;
  } catch (err) {
    console.error('sendText failed:', err.message);
    return false;
  }
}

export async function sendImage(jid, imagePathOrBuffer, caption) {
  try {
    const sock = readySock();
    if (!sock) return false;
    const to = toJid(jid);
    if (!to) return false;
    const image = Buffer.isBuffer(imagePathOrBuffer)
      ? imagePathOrBuffer
      : { url: imagePathOrBuffer };
    await sock.sendMessage(to, { image, caption: caption || undefined });
    await logOutgoing(to, caption || '[image]');
    return true;
  } catch (err) {
    console.error('sendImage failed:', err.message);
    return false;
  }
}
