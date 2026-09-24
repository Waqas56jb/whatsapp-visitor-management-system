import { ConversationLog, Host } from '../models/index.js';
import { handleIncomingMessage } from './conversationEngine.js';
import { handleVisitorWithAgent } from './visitorAgent.js';
import { sendText } from './sendMessage.js';
import { chatJidFromMsg, extractText, isIgnorableJid, isUserChatMessage, phoneFromMsg } from './inbound.js';

const lastMessageAt = new Map();

function allowMessage(key) {
  const now = Date.now();
  const prev = lastMessageAt.get(key) || 0;
  if (now - prev < 1200) return false;
  lastMessageAt.set(key, now);
  return true;
}

const DECISION_RE = /\b(approve|reject)\s+(vms-\d{4}-\d+)/i;
const SHORT_DECISION_RE = /^(yes[, ]+)?(approve|reject)(\s+it)?\.?$/i;

async function handleHostCommand(from, text, ctx, fromMe = false) {
  const raw = String(text || '').trim();
  const match = raw.match(DECISION_RE);
  const short = !match && SHORT_DECISION_RE.test(raw);
  if (!match && !short) return false;

  const host = ctx.hostId ? await Host.findById(ctx.hostId) : await Host.findByPhone(from);
  if (!host) return false;

  await sendText(
    from,
    [
      'WhatsApp approve/reject is not available yet.',
      'Please open the Client Portal → Visit requests to approve or reject this visit.',
      'This WhatsApp action will be added after project lock.',
    ].join('\n'),
    { onlyTarget: true }
  );
  return true;
}

async function resolveHost(ctx) {
  let hostId = ctx.hostId || null;
  if (!hostId && ctx.accountId) {
    const host = await Host.findByAccountId(ctx.accountId);
    hostId = host?.id || null;
    if (hostId) ctx.hostId = hostId;
  }
  const host = hostId ? await Host.findById(hostId) : null;
  return {
    accountId: ctx.accountId || 0,
    hostId: hostId || host?.id || null,
    hostName: host?.name || null,
    replyJid: ctx.replyJid || null,
  };
}

export function attachMessageHandler(sock, ctx = {}) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type === 'prepend') return;
    for (const msg of messages || []) {
      try {
        if (!isUserChatMessage(msg)) continue;
        const ts = Number(msg.messageTimestamp || 0) * 1000;
        if (ts && Date.now() - ts > 3 * 60 * 1000) continue;
        const chatJid = chatJidFromMsg(msg);
        if (isIgnorableJid(chatJid)) continue;

        const text = extractText(msg);
        const from = phoneFromMsg(msg);
        const inboundCtx = { ...ctx, replyJid: chatJid };

        if (msg.key?.fromMe) {
          if (text && DECISION_RE.test(text) && inboundCtx.hostId) {
            await handleHostCommand(from, text, inboundCtx, true);
          }
          continue;
        }

        if (!from && !chatJid) continue;
        const visitorId = from || chatJid;
        console.log(`[wa ${ctx.key || ctx.accountId}] inbound ${visitorId} jid=${chatJid} text=${(text || '').slice(0, 80)}`);

        await ConversationLog.add({
          phone_number: visitorId,
          direction: 'incoming',
          message_text: text || '[media]',
          account_id: ctx.accountId || null,
        }).catch((err) => console.error('Conversation incoming log failed:', err.message));

        if (!allowMessage(`${ctx.accountId || 'admin'}:${visitorId}`)) continue;
        if (await handleHostCommand(visitorId, text, inboundCtx)) continue;

        const visitorCtx = await resolveHost(inboundCtx);
        const payload = { from: visitorId, text: text || 'hello', ctx: visitorCtx, accountId: visitorCtx.accountId, hostId: visitorCtx.hostId, replyJid: chatJid };

        try {
          if (process.env.OPENAI_API_KEY) {
            await handleVisitorWithAgent(payload);
          } else {
            await handleIncomingMessage(payload);
          }
        } catch (err) {
          console.error('Visitor reply failed:', err.message);
          await sendText(
            visitorId,
            'I can help you book a visit. Please send your name, company, purpose, date, time, and the host you want to see.',
            {
              accountId: visitorCtx.accountId,
              replyJid: chatJid,
            }
          );
        }
      } catch (err) {
        console.error('WhatsApp message handler failed:', err.message);
      }
    }
  });
}
