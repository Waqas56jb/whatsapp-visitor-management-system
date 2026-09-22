import { ConversationLog, Host } from '../models/index.js';
import { phoneFromJid } from '../utils/phone.js';
import { decideVisitByRef } from '../services/visits.js';
import { handleIncomingMessage } from './conversationEngine.js';
import { sendText } from './sendMessage.js';

const lastMessageAt = new Map();

function extractText(msg) {
  const m = msg.message || {};
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    m.templateButtonReplyMessage?.selectedDisplayText ||
    ''
  ).trim();
}

function allowMessage(phone) {
  const now = Date.now();
  const prev = lastMessageAt.get(phone) || 0;
  if (now - prev < 1000) return false;
  lastMessageAt.set(phone, now);
  return true;
}

const DECISION_RE = /^(approve|reject)\s+(vms-\d{4}-\d+)/i;

async function handleHostCommand(from, text) {
  const match = text.match(DECISION_RE);
  if (!match) return false;
  const host = await Host.findByPhone(from);
  if (!host) return false;

  const decision = match[1].toLowerCase() === 'approve' ? 'approved' : 'rejected';
  const ref = match[2].toUpperCase();
  const result = await decideVisitByRef({
    ref,
    decision,
    actorPhone: from,
  });
  if (result.error) {
    await sendText(from, result.error);
    return true;
  }
  if (result.alreadyDecided) {
    await sendText(from, `This request was already ${result.visit.status}.\nReference: ${result.visit.ref_number}`);
  }
  return true;
}

export function attachMessageHandler(sock) {
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages || []) {
      try {
        if (!msg?.message || msg.key?.fromMe) continue;
        const jid = msg.key.remoteJid || '';
        if (jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@broadcast')) continue;
        const from = phoneFromJid(jid);
        if (!from) continue;
        const text = extractText(msg);
        await ConversationLog.add({
          phone_number: from,
          direction: 'incoming',
          message_text: text || '[media]',
        }).catch((err) => console.error('Conversation incoming log failed:', err.message));
        if (!allowMessage(from)) continue;
        if (await handleHostCommand(from, text)) continue;
        await handleIncomingMessage({ from, text, jid });
      } catch (err) {
        console.error('WhatsApp message handler failed:', err.message);
      }
    }
  });
}
