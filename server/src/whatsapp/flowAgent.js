// Connects the Corporate Office chat flow to the current company's data: loads the conversation,
// gives the flow its io (hosts, bookings, profile, feedback, tickets, documents, handovers),
// saves the new state and sends the replies from the company's number.
import { Audit, Company, ConversationState, Document, Feedback, Handover, Host, ServiceRequest, Visit, Visitor } from '../models/index.js';
import { describeCompany } from '../services/companyConfig.js';
import { checkLimit } from '../services/limits.js';
import { platformConfig } from '../services/platformConfig.js';
import { notifySlack } from '../services/slack.js';
import { cancelVisitByVisitor, createPendingVisit, rescheduleVisitByVisitor } from '../services/visits.js';
import { tenantId } from '../tenant.js';
import { nowTimeIn, todayIn } from '../utils/dateParse.js';
import { formatDate } from '../utils/mappers.js';
import { normalizePhone } from '../utils/phone.js';
import { withUniqueRef } from '../utils/refs.js';
import { conflictAt } from './availability.js';
import { loadFlowState, runFlow } from './corporateFlow.js';
import { answerVisitor } from './faq.js';
import { ft } from './flowMessages.js';
import { calendarInvite } from './notify.js';
import { sendDocument, sendText } from './sendMessage.js';

// Write-through copy of each conversation, so a slow or failed DB write never makes the bot
// forget where a visitor is. The database stays the durable store across restarts.
const liveStates = new Map();
const stateKey = (phone) => `${tenantId()}|${normalizePhone(phone) || phone}`;

export function forgetLiveState(phone) {
  liveStates.delete(stateKey(phone));
}

async function loadConversation(phone) {
  const cached = liveStates.get(stateKey(phone));
  let stored = null;
  try {
    stored = (await ConversationState.findByPhone(phone))?.collected_data || null;
  } catch (err) {
    console.error(`Conversation load failed for ${phone}: ${err.message}`);
  }
  return (cached?.savedAt || 0) >= (stored?.savedAt || 0) ? cached : stored;
}

async function saveConversation(phone, state) {
  const record = { ...state, savedAt: Date.now() };
  liveStates.set(stateKey(phone), record);
  if (liveStates.size > 5000) liveStates.delete(liveStates.keys().next().value);
  try {
    await ConversationState.upsert(phone, state.step, record);
  } catch (err) {
    console.error(`CONVERSATION STATE NOT SAVED for ${phone} (kept in memory): ${err.message}`);
  }
}

// True while this number is in the middle of a chat flow (so a host's "1"/"yes" answers their
// own question first).
export async function flowWaiting(phone) {
  const state = loadFlowState(await loadConversation(phone));
  return !['idle', 'menu', 'handover'].includes(state.step);
}

function mapBooking(v) {
  return {
    ref: v.ref_number,
    kind: v.kind || 'visit',
    hostId: v.host_id,
    hostName: v.host_name,
    hostDepartment: v.host_department && v.host_department !== '—' ? v.host_department : '',
    hostOffice: v.host_office || '',
    date: formatDate(v.visit_date),
    time: String(v.visit_time || '').slice(0, 5),
    status: v.status,
    purpose: v.purpose,
    pin: v.pin,
  };
}

const SERVICE_LABELS = {
  open: ['Open', 'E butswe'],
  in_progress: ['In progress', 'E a dirwa'],
  resolved: ['Resolved', 'E rarabolotswe'],
  closed: ['Closed', 'E tswetswe'],
};
export { SERVICE_LABELS };

async function downloadMedia(media) {
  const buffer = await media.download();
  if (!buffer || !buffer.length) throw new Error('empty file');
  if (buffer.length > 10 * 1024 * 1024) throw new Error('file larger than 10 MB');
  return buffer;
}

export function buildIo({ phone, company, visitor, hosts, today, now, defaultLanguage }) {
  const io = {
    company,
    visitor,
    hosts,
    today,
    now,
    defaultLanguage,
    clock: () => Date.now(),

    async saveProfile({ name, profile_type, company: org, email }) {
      const existing = await Visitor.findByPhone(phone);
      const row = existing
        ? await Visitor.update(existing.id, { name, profile_type, company: org, email })
        : await Visitor.create({ name, company: org, phone: normalizePhone(phone), email, profile_type });
      await Audit.add({ actor: name, action: 'Visitor profile created', details: `${name} (${profile_type}) via WhatsApp` });
      io.visitor = row;
      return row;
    },

    async openBookings() {
      const rows = await Visit.listOpenFrom(today).catch(() => []);
      return (rows || []).map((r) => ({
        ref: r.ref_number,
        hostId: r.host_id,
        date: formatDate(r.visit_date),
        time: String(r.visit_time || '').slice(0, 5),
        status: r.status,
      }));
    },

    async limitReached(limit) {
      return (await checkLimit(limit).catch(() => ({ reached: false }))).reached;
    },

    async createVisit(v) {
      if (await io.limitReached('visits_per_month')) return { ok: false, reason: 'limit' };
      // Re-check the slot right before saving: another visitor may have taken it.
      if (conflictAt(await io.openBookings(), v.hostId, v.date, v.time)) return { ok: false, reason: 'slot_taken' };
      try {
        const name = io.visitor?.name || 'Visitor';
        const visit = await createPendingVisit({
          name,
          company: io.visitor?.company || '—',
          hostId: v.hostId,
          purpose: v.purpose,
          date: v.date,
          time: v.time,
          visitType: /\b(personal|social|family|friend)\b/i.test(v.purpose) ? 'social' : 'official',
          visitorPhone: phone,
          kind: v.kind,
          appointmentType: v.appointmentType,
          topic: v.topic,
          flagged: v.flagged,
          flagReason: v.flagReason,
          screening: v.screening,
          idDocId: v.idDocId,
          actor: name,
          notify: true,
          notifyVisitor: false,
          notifyHost: true,
        });
        return { ok: true, ref: visit.ref_number, hostName: visit.host_name };
      } catch (err) {
        console.error('WhatsApp booking failed:', err.message);
        return { ok: false, reason: 'error' };
      }
    },

    async upcoming() {
      const rows = await Visit.listByVisitorPhone(phone, 30);
      return rows
        .filter((v) => ['pending', 'approved'].includes(v.status) && formatDate(v.visit_date) >= today)
        .map(mapBooking)
        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
        .slice(0, 9);
    },

    async bookingDetails(ref) {
      const v = await Visit.findByRef(ref);
      if (!v || normalizePhone(v.visitor_phone || v.visitor_profile_phone) !== normalizePhone(phone)) return null;
      return mapBooking(v);
    },

    async cancel(ref) {
      const result = await cancelVisitByVisitor({ ref, visitorPhone: phone }).catch(() => ({ ok: false }));
      return result;
    },

    async reschedule(ref, date, time) {
      return rescheduleVisitByVisitor({ ref, visitorPhone: phone, date, time }).catch(() => ({ ok: false }));
    },

    async calendarFile(ref, lang) {
      const v = await Visit.findByRef(ref);
      if (!v || normalizePhone(v.visitor_phone || v.visitor_profile_phone) !== normalizePhone(phone)) return null;
      return calendarInvite(v, lang);
    },

    async hasIdOnFile() {
      if (!io.visitor?.id) return false;
      return Boolean(await Document.latestIdForVisitor(io.visitor.id).catch(() => null));
    },

    async saveDocument(kind, media) {
      try {
        const buffer = await downloadMedia(media);
        const storage = await checkLimit('storage_mb', buffer.length).catch(() => ({ reached: false }));
        if (storage.reached) return { ok: false, reason: 'storage limit reached' };
        const row = await Document.create({
          kind,
          phone,
          visitor_id: io.visitor?.id || null,
          mime: media.mime || 'application/octet-stream',
          file_name: media.fileName || '',
          data: buffer,
        });
        return { ok: true, id: row.id };
      } catch (err) {
        console.error('Document save failed:', err.message);
        return { ok: false, reason: err.message };
      }
    },

    async createFeedback(f) {
      const row = await withUniqueRef(f.isComplaint ? 'CMP' : 'FB', (ref) =>
        Feedback.create({
          ref_number: ref,
          phone: normalizePhone(phone),
          visitor_id: io.visitor?.id || null,
          visit_id: f.visitId || null,
          topic: f.topic,
          rating: f.rating,
          comment: f.comment,
          is_complaint: f.isComplaint,
          contact_requested: f.contactRequested,
        })
      );
      if (f.isComplaint) {
        await Audit.add({
          actor: io.visitor?.name || 'Visitor',
          action: 'Complaint escalated',
          details: `${row.ref_number}${f.contactRequested ? ' · wants a call back' : ''}: ${String(f.comment).slice(0, 160)}`,
        });
        notifySlack(
          'complaint',
          `⚠️ Complaint ${row.ref_number} from ${io.visitor?.name || phone} (+${normalizePhone(phone)})${f.contactRequested ? ' — wants to be contacted' : ''}:\n${f.comment}`
        ).catch(() => {});
      }
      return { ref: row.ref_number };
    },

    async createServiceRequest(r) {
      const row = await withUniqueRef('SR', (ref) =>
        ServiceRequest.create({
          ref_number: ref,
          phone,
          visitor_id: io.visitor?.id || null,
          category: r.category,
          description: r.description,
          priority: r.priority,
        })
      );
      if (r.docId) await Document.linkServiceRequest(r.docId, row.id).catch(() => {});
      await Audit.add({ actor: io.visitor?.name || 'Visitor', action: 'Service request created', details: `${row.ref_number} (${r.category}, ${r.priority})` });
      notifySlack('serviceRequest', `🔧 Service request ${row.ref_number} (${r.category}, ${r.priority}) from ${io.visitor?.name || phone}:\n${r.description}`).catch(() => {});
      return { ref: row.ref_number };
    },

    async statusItems(raw = '') {
      const ref = String(raw).match(/\b(VMS-\d{4}-\d+|SR-\d+|FB-\d+|CMP-\d+)\b/i)?.[0]?.toUpperCase();
      const [visits, tickets, feedback] = await Promise.all([
        Visit.listByVisitorPhone(phone, 5),
        ServiceRequest.listByPhone(phone, 5),
        Feedback.listByPhone(phone, 3),
      ]);
      const pick = (rows, key) => (ref ? rows.filter((r) => String(r[key]).toUpperCase() === ref) : rows);
      return {
        visits: pick(visits, 'ref_number').slice(0, 3).map(mapBooking),
        tickets: pick(tickets, 'ref_number').slice(0, 3).map((t) => ({ ref: t.ref_number, category: t.category, status: t.status })),
        feedback: ref ? pick(feedback, 'ref_number').map((f) => ({ ref: f.ref_number, topic: f.topic })) : [],
      };
    },

    async answer(question, lang) {
      if (!company.features.knowledge_base && !company.features.ai_answers) return { text: '', known: false };
      const result = await answerVisitor({
        phone,
        question,
        lang,
        orgName: company.name,
        hosts,
        useAi: Boolean(company.features.ai_answers),
      });
      return result;
    },

    async openHandover(department) {
      const row = await withUniqueRef('HO', (ref) => Handover.create({ ref_number: ref, phone, department }));
      await Audit.add({ actor: io.visitor?.name || 'Visitor', action: 'Asked for a staff member', details: `${row.ref_number} → ${department}` });
      notifySlack('handover', `👤 ${io.visitor?.name || phone} (+${normalizePhone(phone)}) asked to talk to ${department} (${row.ref_number}). Reply from the Conversations page.`).catch(() => {});
      return { ref: row.ref_number };
    },

    async handoverOpen() {
      return Boolean(await Handover.openForPhone(phone));
    },

    async closeHandover() {
      await Handover.close(phone, 'visitor');
    },
  };
  return io;
}

// One incoming visitor message (inside the company's tenant context).
export async function handleVisitorMessage({ from, text, media = null, replyJid = null }) {
  const companyRow = await Company.findById(tenantId());
  const company = describeCompany(companyRow);
  const timeZone = company.settings.timezone || 'Africa/Gaborone';
  const today = todayIn(timeZone);
  const now = nowTimeIn(timeZone);
  const [saved, visitor, hosts, platform] = await Promise.all([
    loadConversation(from),
    Visitor.findByPhone(from).catch(() => null),
    Host.listActive().catch(() => []),
    platformConfig(),
  ]);
  const io = buildIo({ phone: from, company, visitor, hosts, today, now, defaultLanguage: platform.defaultLanguage });
  const result = await runFlow({ state: saved, text, media, io });
  await saveConversation(from, result.state);

  const sendOpts = { replyJid };
  for (const reply of result.replies) {
    const sent = await sendText(from, reply, sendOpts);
    if (!sent) console.error(`Visitor reply was not delivered to ${from}`);
  }
  for (const file of result.files) {
    await sendDocument(from, file.buffer, file, sendOpts);
  }
  return result;
}

export async function sendVisitorError(from, replyJid = null) {
  const state = loadFlowState(await loadConversation(from).catch(() => null));
  await sendText(from, ft(state.lang || 'en', 'common.error'), { replyJid });
}

// Staff closed a handover from the panel: the assistant takes over again.
export async function endHandoverFromPanel(phone, staffName) {
  const closed = await Handover.close(phone, staffName);
  const state = loadFlowState(await loadConversation(phone));
  if (state.step === 'handover') {
    await saveConversation(phone, { ...state, step: 'menu', data: {}, stack: [] });
  }
  if (closed.length) await sendText(phone, ft(state.lang || 'en', 'ho.closedByStaff'));
  return closed.length > 0;
}

// Staff reply from the Conversations page (only while the company's number is connected).
export async function staffReply(phone, message) {
  return sendText(phone, message);
}
