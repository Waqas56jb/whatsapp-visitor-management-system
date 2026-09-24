// Answers anything a visitor asks, with full context: the saved WhatsApp history for this number,
// the visitor's own visit requests (live status from the database), the booking in progress,
// and the company knowledge base. It never creates, changes, approves, or rejects bookings.
import OpenAI from 'openai';
import { KNOWLEDGE_DEFAULTS } from '../config/knowledgeDefaults.js';
import { ConversationLog, Knowledge, Visit } from '../models/index.js';
import { formatDate } from '../utils/mappers.js';
import { normalizeText } from './hostMatch.js';
import { formatVisitDate, formatVisitTime, statusLabel, t } from './messages.js';

const HISTORY_LIMIT = 30;

function clip(text, max = 2500) {
  const value = String(text || '').trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

async function loadKnowledge() {
  const rows = await Knowledge.listAll().catch(() => []);
  const byKind = (kind) => rows.filter((r) => r.kind === kind);
  const saved = byKind('qa').filter((r) => r.question || r.answer);
  const qa = (saved.length ? saved : KNOWLEDGE_DEFAULTS.faqs).map((r) => ({
    question: r.question || r.title || '',
    answer: r.answer || '',
  }));
  return {
    qa,
    instruction: byKind('instruction').map((r) => r.answer).filter(Boolean).join('\n') || KNOWLEDGE_DEFAULTS.instruction,
    rules: byKind('rule').map((r) => `${r.title ? `${r.title}: ` : ''}${r.answer}`).join('\n'),
    documents: [...byKind('document'), ...byKind('text'), ...byKind('website')]
      .map((r) => `${r.title || r.question || 'Source'}\n${clip(r.answer)}`)
      .join('\n\n'),
  };
}

// The visitor's own requests, newest first, straight from the database.
export async function loadVisitorVisits(phone, limit = 5) {
  const rows = await Visit.listByVisitorPhone(phone, limit).catch(() => []);
  return (rows || []).map((v) => ({
    ref: v.ref_number,
    host: v.host_name,
    department: v.host_department && v.host_department !== '—' ? v.host_department : '',
    date: formatDate(v.visit_date),
    time: v.visit_time,
    purpose: v.purpose,
    status: v.status,
  }));
}

async function loadTranscript(phone) {
  const rows = await ConversationLog.listByPhone(phone).catch(() => []);
  return (rows || []).slice(-HISTORY_LIMIT).map((m) => ({
    role: m.direction === 'outgoing' ? 'assistant' : 'user',
    content: String(m.message_text || '').slice(0, 800),
  }));
}

function describeVisit(v, lang) {
  return t(lang, 'visit.summary', {
    ref: v.ref,
    host: v.host,
    date: formatVisitDate(v.date, lang),
    time: formatVisitTime(v.time, lang),
    status: statusLabel(v.status, lang),
  });
}

function keywordAnswer(question, qa) {
  const q = new Set(normalizeText(question).split(' ').filter((w) => w.length > 2));
  let best = null;
  for (const item of qa) {
    const words = normalizeText(item.question).split(' ').filter((w) => w.length > 2);
    if (!words.length) continue;
    const hits = words.filter((w) => q.has(w)).length;
    const score = hits / words.length;
    if (hits >= 2 || score >= 0.6) {
      if (!best || score > best.score) best = { score, answer: item.answer };
    }
  }
  return best?.answer || '';
}

const ABOUT_OWN_VISIT =
  /\b(re?q[a-z]{0,2}u?e?s?t|reuqest|booking|booked|book|app?oi?ntment|oppointment|visit|applied|reference|ref|status|approved?|rejected|declined|host|pass|qr|pin|update|given|sent|forwarded|received|confirm(ed)?|kopo|ketelo)\b/i;

// Deterministic answer used without an API key, or if the model call fails.
function fallbackAnswer({ question, lang, visits, kb }) {
  const q = normalizeText(question);
  const namesHost = visits.some((v) => normalizeText(v.host).split(' ').some((part) => part.length > 2 && ` ${q} `.includes(` ${part} `)));
  if (visits.length && (ABOUT_OWN_VISIT.test(question) || namesHost)) {
    return t(lang, 'visit.latest', { summary: describeVisit(visits[0], lang) });
  }
  return keywordAnswer(question, kb.qa) || t(lang, 'faq.fallback');
}

function plain(text) {
  return String(text || '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function answerVisitor({ phone, question, lang = 'en', orgName = 'Botho Innovations', hosts = [], slots = {}, pendingQuestion = '' }) {
  const [kb, visits, transcript] = await Promise.all([loadKnowledge(), loadVisitorVisits(phone), loadTranscript(phone)]);
  if (!process.env.OPENAI_API_KEY) return fallbackAnswer({ question, lang, visits, kb });

  const language = lang === 'tn' ? 'Setswana' : 'English';
  const hostLines = hosts.map((h) => `${h.name}${h.department && h.department !== '—' ? ` (${h.department})` : ''}`).join('\n');
  const visitLines = visits.length
    ? visits
        .map((v) => `${v.ref} | host: ${v.host}${v.department ? ` (${v.department})` : ''} | ${formatVisitDate(v.date, 'en')} at ${formatVisitTime(v.time, 'en')} | purpose: ${v.purpose} | status: ${v.status}`)
        .join('\n')
    : 'This visitor has no visit requests yet.';
  const inProgress = Object.entries(slots)
    .filter(([k, v]) => v && !['hostId'].includes(k))
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');

  const system = [
    `You are the WhatsApp receptionist of ${orgName} (Botswana) for visitor bookings.`,
    `Reply only in ${language}. If ${language} is Setswana, write natural, correct Setswana.`,
    'You have read the full chat history with this visitor (the earlier messages below). Use it to understand what they mean and never ask again for something already answered there.',
    'Answer the visitor’s latest message directly, warmly, and professionally, in one to three short sentences. Plain text only: no markdown, no asterisks, no bullet points.',
    'Facts about their own visit requests come ONLY from "Visitor’s visit requests" below — it is live from the database. Quote the reference, host, date, time, and status exactly. pending = waiting for the host to approve; approved = approved, the QR pass was sent on WhatsApp; rejected = declined by the host; used = already checked in.',
    'When a request is pending, confirm it was sent to the host and that the visitor will be notified in this chat once the host approves or declines. Do not mention portals or internal systems.',
    'Never invent a request, reference, host, date, time, status, policy, or price. If you do not know, say so and suggest asking at reception.',
    'You cannot create, change, cancel, approve, or reject a booking yourself. To make a new booking the visitor just sends their details; to change one they send "new booking".',
    'Do not ask for booking details — the system asks the next booking question itself after your reply.',
    'Refuse programming, homework, and anything unrelated to visiting the company, politely.',
    `Visitor’s visit requests (newest first):\n${visitLines}`,
    inProgress ? `Booking currently being collected in this chat: ${inProgress}` : '',
    pendingQuestion ? `The system is waiting for the visitor to answer: "${pendingQuestion}"` : '',
    kb.instruction ? `Company instructions:\n${kb.instruction}` : '',
    kb.rules ? `Company rules:\n${kb.rules}` : '',
    kb.qa.length ? `FAQs:\n${kb.qa.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')}` : '',
    kb.documents ? `Company documents:\n${kb.documents}` : '',
    hostLines ? `People and departments visitors can book:\n${hostLines}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  // The visitor's latest message is already the last logged incoming row; drop it so it is not sent twice.
  const history = [...transcript];
  if (history.length && history[history.length - 1].role === 'user' && history[history.length - 1].content.trim() === question.trim()) {
    history.pop();
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 250,
      messages: [{ role: 'system', content: system }, ...history, { role: 'user', content: question }],
    });
    const reply = plain(completion.choices?.[0]?.message?.content);
    if (reply && !/how can i (assist|help) you( today)?/i.test(reply)) return reply;
  } catch (err) {
    console.error('Visitor answer failed:', err.message);
  }
  return fallbackAnswer({ question, lang, visits, kb });
}
