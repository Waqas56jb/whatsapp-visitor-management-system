// I/O wrapper around the pure booking engine: loads state, performs actions, persists, replies.
import { ConversationState, Settings, Visit } from '../models/index.js';
import { listActiveHosts } from '../services/hosts.js';
import { createPendingVisit } from '../services/visits.js';
import { todayStamp } from '../utils/dateParse.js';
import { formatDate } from '../utils/mappers.js';
import { normalizePhone } from '../utils/phone.js';
import { afterBooking, currentPrompt, loadState, runTurn } from './bookingEngine.js';
import { answerQuestion } from './faq.js';
import { formatVisitDate, formatVisitTime, statusLabel, t } from './messages.js';
import { sendText } from './sendMessage.js';

function joinReplies(...parts) {
  return parts.filter(Boolean).join('\n\n');
}

async function bookVisit(state, from) {
  const { slots, lang } = state;
  try {
    const visit = await createPendingVisit({
      name: slots.name,
      company: slots.company || '—',
      hostId: slots.hostId,
      purpose: slots.purpose,
      date: slots.date,
      time: slots.time,
      visitType: /^personal$/i.test(slots.company) ? 'social' : 'official',
      visitorPhone: from,
      actor: slots.name || 'Visitor',
      notify: true,
      notifyVisitor: false,
      notifyHost: true,
    });
    return {
      ok: true,
      ref: visit.ref_number,
      hostName: visit.host_name,
      date: formatVisitDate(formatDate(visit.visit_date), lang),
      time: formatVisitTime(visit.visit_time, lang),
    };
  } catch (err) {
    console.error('WhatsApp booking failed:', err.message);
    return { ok: false, reason: /host not found/i.test(err.message) ? 'host_missing' : 'error' };
  }
}

async function statusReply(ref, from, lang) {
  const visit = await Visit.findByRef(ref).catch(() => null);
  const owner = normalizePhone(visit?.visitor_phone || visit?.visitor_profile_phone);
  if (!visit || (owner && owner !== normalizePhone(from))) return t(lang, 'status.notFound', { ref });
  return t(lang, 'status.header', {
    ref: visit.ref_number,
    host: visit.host_name,
    date: formatVisitDate(formatDate(visit.visit_date), lang),
    time: formatVisitTime(visit.visit_time, lang),
    status: statusLabel(visit.status, lang),
  });
}

export async function handleVisitorWithAgent({ from, text, ctx = {}, replyJid = null }) {
  const accountId = ctx.accountId || 0;
  const sendOpts = { accountId: accountId || null, replyJid: replyJid || ctx.replyJid || null };
  const [prior, hosts, settings] = await Promise.all([
    ConversationState.findByPhone(from, accountId),
    listActiveHosts(),
    Settings.get().catch(() => null),
  ]);
  const orgName = settings?.org_name || 'Botho Innovations';
  const previous = loadState(prior?.collected_data);
  const turn = runTurn(previous, text, { hosts, today: todayStamp(), orgName });

  let state = turn.state;
  let reply = turn.reply;
  for (const action of turn.actions) {
    if (action.type === 'book') {
      const outcome = await bookVisit(state, from);
      const booked = afterBooking(state, outcome, { hosts });
      state = booked.state;
      reply = joinReplies(reply, booked.reply);
    } else if (action.type === 'status') {
      reply = joinReplies(reply, await statusReply(action.ref, from, state.lang), action.followUp);
    } else if (action.type === 'faq') {
      const answer = await answerQuestion({ question: action.question, lang: state.lang, orgName, hosts });
      reply = joinReplies(reply, answer, action.followUp);
    }
  }
  if (!reply) reply = currentPrompt(state) || t(state.lang, 'welcome');

  state.history = [
    ...(state.history || []),
    { role: 'user', content: String(text || '[media]') },
    { role: 'assistant', content: reply },
  ].slice(-20);
  await ConversationState.upsert(from, state.stage, state, accountId).catch((err) =>
    console.error('Conversation persist failed:', err.message)
  );

  const sent = await sendText(from, reply, sendOpts);
  if (!sent) console.error(`Visitor reply was not delivered to ${from}`);
  return { reply, state };
}

export async function sendVisitorError(from, ctx = {}, replyJid = null) {
  const prior = await ConversationState.findByPhone(from, ctx.accountId || 0).catch(() => null);
  const lang = loadState(prior?.collected_data).lang;
  await sendText(from, t(lang, 'error'), { accountId: ctx.accountId || null, replyJid: replyJid || null });
}
