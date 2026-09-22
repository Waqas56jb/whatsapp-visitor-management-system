import { ConversationLog, Host } from '../models/index.js';
import { phoneFromJid } from '../utils/phone.js';
import { decideVisitByRef } from '../services/visits.js';
import { handleIncomingMessage } from './conversationEngine.js';
import { handleVisitorWithAgent } from './visitorAgent.js';
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

function allowMessage(key) {
  const now = Date.now();
  const prev = lastMessageAt.get(key) || 0;
  if (now - prev < 1000) return false;
  lastMessageAt.set(key, now);
  return true;
}

const DECISION_RE = /^(approve|reject)\s+(vms-\d{4}-\d+)/i;

async function handleHostCommand(from, text, ctx, fromMe = false) {
  const match = String(text || '').match(DECISION_RE);
  if (!match) return false;
  const decision = match[1].toLowerCase() === 'approve' ? 'approved' : 'rejected';
  const ref = match[2].toUpperCase();
  const result = await decideVisitByRef({
    ref,
    decision,
    actorPhone: from,
    actorHostId: ctx.hostId || null,
    notifyHostPhone: fromMe ? null : from,
  });
  if (result.error) {
    await sendText(from, result.error, { accountId: ctx.accountId });
    return true;
  }
  if (result.alreadyDecided) {
    await sendText(
      from,
      `This request was already ${result.visit.status}.\nReference: ${result.visit.ref_number}`,
      { accountId: ctx.accountId }
    );
  }
  return true;
}

export function attachMessageHandler(sock, ctx = {}) {
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages || []) {
      try {
        if (!msg?.message) continue;
        const jid = msg.key.remoteJid || '';
        if (jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@broadcast')) continue;
        const text = extractText(msg);
        const from = phoneFromJid(jid) || phoneFromJid(msg.key.participant);

        if (msg.key?.fromMe) {
          if (text && DECISION_RE.test(text) && ctx.hostId) {
            await handleHostCommand(from, text, ctx, true);
          }
          continue;
        }

        if (!from) continue;
        await ConversationLog.add({
          phone_number: from,
          direction: 'incoming',
          message_text: text || '[media]',
          account_id: ctx.accountId || null,
        }).catch((err) => console.error('Conversation incoming log failed:', err.message));
        if (!allowMessage(`${ctx.accountId || 'admin'}:${from}`)) continue;
        if (await handleHostCommand(from, text, ctx)) continue;

        const host = ctx.hostId ? await Host.findById(ctx.hostId) : null;
        const visitorCtx = {
          accountId: ctx.accountId || 0,
          hostId: ctx.hostId || host?.id || null,
          hostName: host?.name || null,
        };
        if (visitorCtx.hostId && process.env.OPENAI_API_KEY) {
          await handleVisitorWithAgent({ from, text, ctx: visitorCtx });
        } else {
          await handleIncomingMessage({ from, text, accountId: visitorCtx.accountId, hostId: visitorCtx.hostId });
        }
      } catch (err) {
        console.error('WhatsApp message handler failed:', err.message);
      }
    }
  });
}
