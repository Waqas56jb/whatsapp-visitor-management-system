import { handleIncomingMessage } from './conversationEngine.js';

const seenMessageIds = new Set();

function remember(id) {
  if (!id) return true;
  if (seenMessageIds.has(id)) return false;
  seenMessageIds.add(id);
  if (seenMessageIds.size > 2000) {
    const first = seenMessageIds.values().next().value;
    seenMessageIds.delete(first);
  }
  return true;
}

export function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

function extractMessages(body) {
  const messages = [];
  for (const entry of body?.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const profileName = value.contacts?.[0]?.profile?.name || '';
      for (const msg of value.messages || []) {
        messages.push({
          id: msg.id,
          from: msg.from,
          type: msg.type,
          profileName,
          text: msg.text?.body || msg.button?.text || '',
          buttonId: msg.interactive?.button_reply?.id || msg.button?.payload || '',
          listId: msg.interactive?.list_reply?.id || '',
        });
      }
    }
  }
  return messages;
}

export async function receiveWebhook(req, res) {
  res.sendStatus(200);
  try {
    if (req.body?.object && req.body.object !== 'whatsapp_business_account') return;
    const messages = extractMessages(req.body);
    for (const msg of messages) {
      if (!remember(msg.id)) continue;
      await handleIncomingMessage(msg);
    }
  } catch (err) {
    console.error('WhatsApp webhook processing failed:', err);
  }
}
