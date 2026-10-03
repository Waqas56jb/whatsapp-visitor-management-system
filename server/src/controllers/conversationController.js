// WhatsApp conversations of the current company: threads, transcripts, staff replies and
// human handovers (a visitor asked for a person; staff answer here and close it when done).
import { Audit, ConversationLog, Handover } from '../models/index.js';
import { actorName } from '../middleware/auth.js';
import { normalizePhone } from '../utils/phone.js';
import { endHandoverFromPanel, staffReply } from '../whatsapp/flowAgent.js';
import { isConnected } from '../whatsapp/connection.js';
import { tenantId } from '../tenant.js';

function mapThread(row) {
  return {
    phone: row.phone,
    visitorName: row.visitor_name || null,
    lastMessage: row.last_message || '',
    messageCount: Number(row.message_count || 0),
    lastAt: row.last_at,
    openHandover: row.open_handover || null,
  };
}

function mapMessage(row) {
  return { id: row.id, phone: row.phone_number, visitId: row.visit_id, direction: row.direction, text: row.message_text, createdAt: row.created_at };
}

export async function listConversations(req, res) {
  const [threads, handovers] = await Promise.all([ConversationLog.listThreads(), Handover.listOpen()]);
  res.json({
    threads: threads.map(mapThread),
    handovers: handovers.map((h) => ({ ref: h.ref_number, phone: h.phone, department: h.department, createdAt: h.created_at })),
  });
}

export async function getConversation(req, res) {
  const phone = normalizePhone(decodeURIComponent(req.params.phoneNumber || ''));
  if (!phone) return res.status(400).json({ error: 'Invalid phone number' });
  const [messages, handover] = await Promise.all([ConversationLog.listByPhone(phone), Handover.openForPhone(phone)]);
  res.json({
    phone,
    messages: messages.map(mapMessage),
    handover: handover ? { ref: handover.ref_number, department: handover.department, createdAt: handover.created_at } : null,
  });
}

export async function replyToConversation(req, res) {
  const phone = normalizePhone(decodeURIComponent(req.params.phoneNumber || ''));
  const text = String(req.body.text || '').trim();
  if (!phone) return res.status(400).json({ error: 'Invalid phone number' });
  if (!text) return res.status(400).json({ error: 'Type a message' });
  if (text.length > 2000) return res.status(400).json({ error: 'The message is too long (max 2000 characters).' });
  if (!isConnected(tenantId())) return res.status(409).json({ error: 'Your WhatsApp number is not connected. Connect it in Settings → WhatsApp.' });
  const sent = await staffReply(phone, text);
  if (!sent) return res.status(502).json({ error: 'WhatsApp did not accept the message. Please try again.' });
  await Audit.add({ actor: actorName(req), action: 'Replied on WhatsApp', details: `+${phone}` });
  res.json({ ok: true });
}

export async function closeHandover(req, res) {
  const phone = normalizePhone(decodeURIComponent(req.params.phoneNumber || ''));
  if (!phone) return res.status(400).json({ error: 'Invalid phone number' });
  const closed = await endHandoverFromPanel(phone, actorName(req));
  if (!closed) return res.status(404).json({ error: 'There is no open handover for this number.' });
  await Audit.add({ actor: actorName(req), action: 'Closed handover', details: `+${phone}` });
  res.json({ ok: true });
}
