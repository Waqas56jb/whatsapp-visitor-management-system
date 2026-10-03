import { downloadMediaMessage } from '@whiskeysockets/baileys';
import pino from 'pino';
import { Company, ConversationLog } from '../models/index.js';
import { checkLimit } from '../services/limits.js';
import { meter } from '../services/metrics.js';
import { runWithTenant } from '../tenant.js';
import { handleHostMessage } from './hostDecisions.js';
import { chatJidFromMsg, extractText, isIgnorableJid, isUserChatMessage, phoneFromMsg, quotedMessageId, senderPhone, unwrapMessage } from './inbound.js';
import { sendText } from './sendMessage.js';
import { handleVisitorMessage, sendVisitorError } from './flowAgent.js';

const mediaLogger = pino({ level: 'silent' });

// WhatsApp can redeliver the same message; remember recent ids so each is handled once.
const seenIds = new Set();
function firstSeen(id) {
  if (!id) return true;
  if (seenIds.has(id)) return false;
  seenIds.add(id);
  if (seenIds.size > 4000) seenIds.delete(seenIds.values().next().value);
  return true;
}

// Messages from one visitor are processed strictly in order, never dropped.
const chains = new Map();
function enqueue(key, task) {
  const run = (chains.get(key) || Promise.resolve()).catch(() => {}).then(task);
  chains.set(key, run);
  run.catch(() => {}).then(() => {
    if (chains.get(key) === run) chains.delete(key);
  });
  return run;
}

// A photo or document in the message, downloaded only when the chat flow needs it.
export function mediaFromMsg(msg, sock) {
  const m = unwrapMessage(msg?.message);
  const image = m.imageMessage;
  const doc = m.documentMessage;
  if (!image && !doc) return null;
  const part = image || doc;
  return {
    kind: image ? 'image' : 'document',
    mime: part.mimetype || (image ? 'image/jpeg' : 'application/octet-stream'),
    fileName: doc?.fileName || (image ? 'photo.jpg' : 'document'),
    size: Number(part.fileLength || 0),
    download: () =>
      downloadMediaMessage(msg, 'buffer', {}, { logger: mediaLogger, reuploadRequest: sock?.updateMediaMessage }),
  };
}

// One incoming chat message for a company: a host's approve/decline reply is handled first,
// everything else goes to the Corporate Office chat flow. Exported so tests drive the real path.
export async function processMessage(msg, ctx = {}) {
  const chatJid = chatJidFromMsg(msg);
  const text = extractText(msg);
  const from = phoneFromMsg(msg) || chatJid;
  const media = ctx.media !== undefined ? ctx.media : mediaFromMsg(msg, ctx.sock);
  meter('wa_messages_in');

  await ConversationLog.add({
    phone_number: from,
    direction: 'incoming',
    message_text: text || (media ? `[${media.kind}] ${media.fileName || ''}`.trim() : '[media]'),
  }).catch((err) => console.error('Conversation incoming log failed:', err.message));

  // The plan's monthly message allowance: over it, the assistant stops answering.
  const messages = await checkLimit('messages_per_month').catch(() => ({ reached: false }));
  if (messages.reached) {
    console.warn(`Company ${ctx.companyId} reached its monthly WhatsApp message limit; message from ${from} not answered.`);
    return;
  }

  try {
    // Host matching uses the sender's real phone number (resolved from a LID when needed).
    const handled = await handleHostMessage({
      phone: await senderPhone(msg, ctx.sock),
      text,
      quotedId: quotedMessageId(msg),
      reply: (message) => sendText(chatJid, message, { onlyTarget: true }),
    });
    if (handled) return;
  } catch (err) {
    console.error('Host decision failed:', err.message);
  }

  try {
    await handleVisitorMessage({ from, text, media, replyJid: chatJid });
  } catch (err) {
    console.error('Visitor reply failed:', err.message);
    await sendVisitorError(from, chatJid).catch(() => {});
  }
}

export function attachMessageHandler(sock, ctx = {}) {
  const companyId = Number(ctx.companyId);
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type === 'prepend') return;
    for (const msg of messages || []) {
      try {
        if (!isUserChatMessage(msg) || msg.key?.fromMe) continue;
        const ts = Number(msg.messageTimestamp || 0) * 1000;
        if (ts && Date.now() - ts > 3 * 60 * 1000) continue;
        const chatJid = chatJidFromMsg(msg);
        if (isIgnorableJid(chatJid)) continue;
        if (!firstSeen(`${companyId}|${msg.key?.id}`)) continue;
        const key = phoneFromMsg(msg) || chatJid;
        if (!key) continue;
        enqueue(`${companyId}|${key}`, () =>
          runWithTenant(companyId, async () => {
            const company = await Company.findById(companyId);
            if (!company || company.status !== 'active') return;
            await processMessage(msg, { ...ctx, companyId, sock });
          })
        ).catch((err) => console.error('WhatsApp message handler failed:', err.message));
      } catch (err) {
        console.error('WhatsApp message handler failed:', err.message);
      }
    }
  });
}
