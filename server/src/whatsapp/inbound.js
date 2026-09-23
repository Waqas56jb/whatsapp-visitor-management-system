import { phoneFromJid } from '../utils/phone.js';

export function unwrapMessage(message) {
  let current = message || {};
  for (let i = 0; i < 6; i += 1) {
    const next =
      current.ephemeralMessage?.message ||
      current.viewOnceMessage?.message ||
      current.viewOnceMessageV2?.message ||
      current.viewOnceMessageV2Extension?.message ||
      current.documentWithCaptionMessage?.message ||
      current.editedMessage?.message ||
      current.lottieStickerMessage?.message;
    if (!next) break;
    current = next;
  }
  return current;
}

export function extractText(msg) {
  const m = unwrapMessage(msg?.message);
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.title ||
    m.templateButtonReplyMessage?.selectedDisplayText ||
    m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
    ''
  )
    .toString()
    .trim();
}

export function isIgnorableJid(jid) {
  const value = String(jid || '');
  return (
    !value ||
    value.endsWith('@g.us') ||
    value === 'status@broadcast' ||
    value.endsWith('@broadcast') ||
    value.endsWith('@newsletter') ||
    value.includes('lid-hosted')
  );
}

export function isUserChatMessage(msg) {
  if (!msg?.message) return false;
  const m = unwrapMessage(msg.message);
  if (m.protocolMessage || m.reactionMessage || m.pollUpdateMessage || m.senderKeyDistributionMessage) return false;
  return true;
}

export function chatJidFromMsg(msg) {
  return msg?.key?.remoteJid || '';
}

export function phoneFromMsg(msg) {
  const key = msg?.key || {};
  const candidates = [key.remoteJidAlt, key.participantAlt, key.senderPn, key.remoteJid, key.participant];
  for (const jid of candidates) {
    if (!jid) continue;
    const value = String(jid);
    if (value.includes('@s.whatsapp.net') || value.includes('@c.us')) return phoneFromJid(value);
  }
  return phoneFromJid(key.remoteJid) || phoneFromJid(key.participant) || '';
}
