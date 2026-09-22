import { getSock } from './connection.js';
import { toJid } from '../utils/phone.js';

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
    return true;
  } catch (err) {
    console.error('sendImage failed:', err.message);
    return false;
  }
}
