import { ConversationLog } from '../models/index.js';
import { normalizePhone } from '../utils/phone.js';

function mapThread(row) {
  return {
    phone: row.phone,
    visitorName: row.visitor_name || null,
    lastMessage: row.last_message || '',
    messageCount: Number(row.message_count || 0),
    lastAt: row.last_at,
  };
}

function mapMessage(row) {
  return {
    id: row.id,
    phone: row.phone_number,
    visitId: row.visit_id,
    direction: row.direction,
    text: row.message_text,
    createdAt: row.created_at,
  };
}

export async function listConversations(req, res) {
  const hostId = req.user?.role === 'host' ? req.user.hostId : null;
  if (req.user?.role === 'host' && !hostId) return res.json([]);
  const rows = await ConversationLog.listThreads(hostId);
  res.json(rows.map(mapThread));
}

export async function listHostConversations(req, res) {
  const hostId = req.user?.hostId;
  if (!hostId) return res.json([]);
  const rows = await ConversationLog.listThreads(hostId);
  res.json(rows.map(mapThread));
}

export async function getConversation(req, res) {
  const phone = normalizePhone(decodeURIComponent(req.params.phoneNumber || ''));
  if (!phone) return res.status(400).json({ error: 'Invalid phone number' });
  if (req.user?.role === 'host') {
    const allowed = await ConversationLog.phoneBelongsToHost(phone, req.user.hostId);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
  }
  const messages = await ConversationLog.listByPhone(phone);
  res.json({ phone, messages: messages.map(mapMessage) });
}
