import { ConversationLog } from '../models/index.js';
import { handleHostMessage } from './hostDecisions.js';
import { chatJidFromMsg, extractText, isIgnorableJid, isUserChatMessage, phoneFromMsg, quotedMessageId, senderPhone } from './inbound.js';
import { sendText } from './sendMessage.js';
import { handleVisitorWithAgent, sendVisitorError } from './visitorAgent.js';

// WhatsApp can redeliver the same message; remember recent ids so each is handled once.
const seenIds = new Set();
function firstSeen(id) {
  if (!id) return true;
  if (seenIds.has(id)) return false;
  seenIds.add(id);
  if (seenIds.size > 2000) seenIds.delete(seenIds.values().next().value);
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

// Every incoming chat message: a host's approve/decline reply is handled first, everything else
// goes to the visitor booking flow. Exported so the manual transcripts drive the real path.
export async function processMessage(msg, ctx = {}) {
  const chatJid = chatJidFromMsg(msg);
  const text = extractText(msg);
  const from = phoneFromMsg(msg) || chatJid;
  console.log(`[wa ${ctx.key || ctx.accountId}] inbound ${from} jid=${chatJid} text=${(text || '').slice(0, 80)}`);

  await ConversationLog.add({
    phone_number: from,
    direction: 'incoming',
    message_text: text || '[media]',
    account_id: ctx.accountId || null,
  }).catch((err) => console.error('Conversation incoming log failed:', err.message));

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
    await handleVisitorWithAgent({ from, text, ctx: { accountId: ctx.accountId || 0 }, replyJid: chatJid });
  } catch (err) {
    console.error('Visitor reply failed:', err.message);
    await sendVisitorError(from, { accountId: ctx.accountId || 0 }, chatJid).catch(() => {});
  }
}

export function attachMessageHandler(sock, ctx = {}) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type === 'prepend') return;
    for (const msg of messages || []) {
      try {
        if (!isUserChatMessage(msg) || msg.key?.fromMe) continue;
        const ts = Number(msg.messageTimestamp || 0) * 1000;
        if (ts && Date.now() - ts > 3 * 60 * 1000) continue;
        const chatJid = chatJidFromMsg(msg);
        if (isIgnorableJid(chatJid)) continue;
        if (!firstSeen(msg.key?.id)) continue;
        const key = phoneFromMsg(msg) || chatJid;
        if (!key) continue;
        enqueue(key, () => processMessage(msg, { ...ctx, sock })).catch((err) =>
          console.error('WhatsApp message handler failed:', err.message)
        );
      } catch (err) {
        console.error('WhatsApp message handler failed:', err.message);
      }
    }
  });
}
