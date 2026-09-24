import { ConversationLog, Host } from '../models/index.js';
import { chatJidFromMsg, extractText, isIgnorableJid, isUserChatMessage, phoneFromMsg } from './inbound.js';
import { sendText } from './sendMessage.js';
import { handleVisitorWithAgent, sendVisitorError } from './visitorAgent.js';

const HOST_DECISION_RE = /^(yes[, ]+)?(approve|reject|decline)\b|\b(approve|reject)\s+vms-\d{4}-\d+/i;

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

// Hosts get a WhatsApp heads-up only; decisions are made in the Client Portal.
async function handleHostCommand(from, text) {
  if (!HOST_DECISION_RE.test(String(text || '').trim())) return false;
  const host = await Host.findByPhone(from);
  if (!host) return false;
  await sendText(
    from,
    [
      'Approving or rejecting visits on WhatsApp is not available yet.',
      'Please open the Client Portal → Visit requests to approve or reject this visit.',
    ].join('\n'),
    { onlyTarget: true }
  );
  return true;
}

async function processMessage(msg, ctx) {
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

  if (await handleHostCommand(from, text)) return;

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
        enqueue(key, () => processMessage(msg, ctx)).catch((err) =>
          console.error('WhatsApp message handler failed:', err.message)
        );
      } catch (err) {
        console.error('WhatsApp message handler failed:', err.message);
      }
    }
  });
}
