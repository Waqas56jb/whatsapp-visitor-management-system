import OpenAI from 'openai';
import { FIRST_TIME_WELCOME, KNOWLEDGE_DEFAULTS } from '../config/knowledgeDefaults.js';
import { ConversationState, Knowledge, Settings, Visit } from '../models/index.js';
import { formatDateNice } from '../utils/mappers.js';
import { normalizePhone } from '../utils/phone.js';
import { listActiveHosts, resolveHostForNotify } from '../services/hosts.js';
import { createPendingVisit } from '../services/visits.js';
import { sendText } from './sendMessage.js';
import {
  askFor,
  cleanReply,
  emptySlots,
  applyPlainAnswer,
  fillEmptySlots,
  isConfirm,
  isGreetingOnly,
  isNewBooking,
  isOffTopic,
  looksLikeQuestion,
  mergeSlots,
  missingSlot,
  slotsReady,
  summaryLines,
} from './slotExtract.js';

const memory = new Map();

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'lookup_host',
      description: 'Find a saved company host by name or department. Never invent a host.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'book_visit',
      description: 'Create the pending visit using the collected visitor details and matched host.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          company: { type: 'string' },
          purpose: { type: 'string' },
          date: { type: 'string' },
          time: { type: 'string' },
          hostName: { type: 'string' },
          hostId: { type: 'number' },
          visitType: { type: 'string', enum: ['official', 'social'] },
        },
        required: ['name', 'purpose', 'date', 'time', 'hostName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_status',
      description: 'Look up a visit by reference number.',
      parameters: {
        type: 'object',
        properties: { ref: { type: 'string' } },
        required: ['ref'],
      },
    },
  },
];

function sendOpts(ctx) {
  return { accountId: ctx.accountId || null, replyJid: ctx.replyJid || null };
}

function memoryKey(from, replyJid) {
  return String(from || replyJid || '').replace(/\D/g, '') || String(from || replyJid || '');
}

function parseState(prior, from, replyJid) {
  const mem = memory.get(memoryKey(from, replyJid)) || {};
  const data = prior?.collected_data || {};
  const history = Array.isArray(data.history) && data.history.length ? data.history : mem.history || [];
  return {
    history: history.slice(-20),
    welcomed: Boolean(data.welcomed || mem.welcomed || history.some((m) => m.role === 'assistant')),
    slots: mergeSlots(mem.slots || {}, data.slots || {}),
    lastRef: data.lastRef || mem.lastRef || null,
  };
}

function remember(from, replyJid, payload) {
  memory.set(memoryKey(from, replyJid), payload);
}

function clip(text, max = 2500) {
  const value = String(text || '').trim();
  return value.length > max ? `${value.slice(0, max)}\n…` : value;
}

async function buildKnowledgePrompt() {
  const rows = await Knowledge.listAll().catch(() => []);
  const byKind = (kind) => rows.filter((r) => r.kind === kind);
  const greeting = String(byKind('greeting')[0]?.answer || '').trim() || KNOWLEDGE_DEFAULTS.greeting;
  const instruction =
    byKind('instruction').map((r) => r.answer).filter(Boolean).join('\n') || KNOWLEDGE_DEFAULTS.instruction;
  const rules = byKind('rule')
    .map((r) => `${r.title ? `${r.title}: ` : ''}${r.answer}`)
    .join('\n');
  const savedQa = byKind('qa').filter((r) => r.question || r.answer);
  const qaSource = savedQa.length
    ? savedQa
    : KNOWLEDGE_DEFAULTS.faqs.map((f) => ({ question: f.question, title: f.question, answer: f.answer }));
  const qa = qaSource.map((r) => `Q: ${r.question || r.title}\nA: ${r.answer}`).join('\n\n');
  const documents = [...byKind('document'), ...byKind('text'), ...byKind('website')]
    .map((r) => `${r.title || r.question || 'Source'}\n${clip(r.answer)}`)
    .join('\n\n');
  const settings = await Settings.get().catch(() => null);
  const org = settings?.org_name || 'Botho Innovations';
  const hosts = await listActiveHosts().catch(() => []);
  const hostLines = hosts.length
    ? hosts.map((h) => `${h.name}${h.department ? ` (${h.department})` : ''}`).join('\n')
    : 'No hosts saved yet.';
  return { greeting, instruction, rules, qa, documents, org, hostLines, hosts };
}

async function bookFromSlots(slots, ctx) {
  const resolved = slots.hostId
    ? { host: { id: slots.hostId, name: slots.hostName, department: slots.hostDept } }
    : await resolveHostForNotify(slots.hostName);
  if (!resolved.host) return { error: resolved.error || 'Host not found', matches: resolved.matches || [] };
  const visit = await createPendingVisit({
    name: slots.name,
    company: slots.company || '—',
    hostId: resolved.host.id,
    purpose: slots.purpose,
    date: slots.date,
    time: slots.time,
    visitType: 'official',
    visitorPhone: ctx.from,
    actor: slots.name || 'Visitor',
    notify: true,
    notifyVisitor: false,
    notifyHost: true,
  });
  const hostPhone = normalizePhone(resolved.host.phone);
  const visitorPhone = normalizePhone(ctx.from);
  const hostNote =
    hostPhone && hostPhone !== visitorPhone
      ? `${visit.host_name} has been notified on WhatsApp. You will receive a message here once they approve or reject the visit.`
      : `${visit.host_name} will review this from the staff panel. You will receive a message here once they respond.`;
  return {
    ok: true,
    ref: visit.ref_number,
    host: visit.host_name,
    text: [
      'Your visit request has been submitted.',
      `Visitor: ${visit.visitor_name}`,
      `Host: ${visit.host_name}`,
      `Date: ${formatDateNice(visit.visit_date)} at ${visit.visit_time}`,
      `Reference: ${visit.ref_number}`,
      hostNote,
    ].join('\n'),
  };
}

async function runTool(name, args, ctx, slots) {
  if (name === 'lookup_host') {
    const resolved = await resolveHostForNotify(args.query);
    if (resolved.host) return { ok: true, host: resolved.host };
    return {
      error: resolved.error,
      matches: resolved.matches || [],
    };
  }
  if (name === 'book_visit') {
    const next = fillEmptySlots(slots, {
      name: args.name,
      company: args.company,
      purpose: args.purpose,
      date: args.date,
      time: args.time,
      hostName: args.hostName,
      hostId: args.hostId || null,
    });
    if (!slotsReady(next)) {
      return { error: 'Missing booking fields. Ask only for the next missing field.', have: summaryLines(next) };
    }
    return bookFromSlots(next, ctx);
  }
  if (name === 'check_status') {
    const visit = await Visit.findByRef(args.ref);
    if (!visit) return { error: 'I could not find that reference.' };
    return {
      ref: visit.ref_number,
      visitor: visit.visitor_name,
      host: visit.host_name,
      date: formatDateNice(visit.visit_date),
      time: visit.visit_time,
      status: visit.status,
    };
  }
  return { error: `Unknown tool ${name}` };
}

async function persistTurn(from, accountId, replyJid, history, extra = {}) {
  const payload = {
    welcomed: true,
    history: history.slice(-20),
    slots: extra.slots || emptySlots(),
    lastRef: extra.lastRef || null,
  };
  remember(from, replyJid, payload);
  await ConversationState.upsert(from, 'ai', payload, accountId).catch((err) => {
    console.error('Conversation persist failed:', err.message);
  });
}

async function replyAndSave({ from, accountId, inbound, history, body, reply, slots, lastRef }) {
  const nextHistory = [...history, { role: 'user', content: body }, { role: 'assistant', content: reply }].slice(-20);
  await persistTurn(from, accountId, inbound.replyJid, nextHistory, { slots, lastRef });
  await sendText(from, reply, sendOpts(inbound));
}

export async function handleVisitorWithAgent({ from, text, ctx, replyJid = null }) {
  const inbound = { ...(ctx || {}), from, replyJid: replyJid || ctx?.replyJid || null };
  const accountId = inbound.accountId || 0;
  const body = String(text || '').trim() || 'hello';
  const kb = await buildKnowledgePrompt();
  const prior = await ConversationState.findByPhone(from, accountId);
  const state = parseState(prior, from, inbound.replyJid);
  let slots = state.slots;
  let history = state.history.slice(-20);

  if (isGreetingOnly(body) || (!state.welcomed && body.length < 4)) {
    slots = emptySlots();
    await replyAndSave({
      from,
      accountId,
      inbound,
      history: [],
      body,
      reply: FIRST_TIME_WELCOME,
      slots,
      lastRef: state.lastRef,
    });
    return;
  }

  if (isNewBooking(body)) {
    slots = emptySlots();
    await replyAndSave({
      from,
      accountId,
      inbound,
      history: [],
      body,
      reply: FIRST_TIME_WELCOME,
      slots,
      lastRef: null,
    });
    return;
  }

  slots = applyPlainAnswer(slots, body, kb.hosts);

  if (isOffTopic(body)) {
    await replyAndSave({
      from,
      accountId,
      inbound,
      history,
      body,
      reply: 'I can only help with visitor bookings, visit status, and Botho Innovations reception information. Who would you like to visit?',
      slots,
      lastRef: state.lastRef,
    });
    return;
  }

  if (/\b(approve|reject)\b/i.test(body) && !/vms-\d{4}-\d+/i.test(body)) {
    await replyAndSave({
      from,
      accountId,
      inbound,
      history,
      body,
      reply: 'I cannot approve or reject visits from this chat. The host will reply APPROVE or REJECT on their own WhatsApp, or staff can decide from the panel.',
      slots,
      lastRef: state.lastRef,
    });
    return;
  }

  if (isConfirm(body) && slotsReady(slots)) {
    const booked = await bookFromSlots(slots, inbound);
    if (booked.ok) {
      await replyAndSave({
        from,
        accountId,
        inbound,
        history,
        body,
        reply: booked.text,
        slots: emptySlots(),
        lastRef: booked.ref,
      });
      return;
    }
    if (booked.matches?.length) {
      await replyAndSave({
        from,
        accountId,
        inbound,
        history,
        body,
        reply: `I found more than one host. Please choose one:\n${booked.matches.map((h, i) => `${i + 1}. ${h.name}${h.department ? ` (${h.department})` : ''}`).join('\n')}`,
        slots,
        lastRef: state.lastRef,
      });
      return;
    }
  }

  const missing = missingSlot(slots);
  if (!looksLikeQuestion(body)) {
    if (missing) {
      await replyAndSave({
        from,
        accountId,
        inbound,
        history,
        body,
        reply: askFor(missing),
        slots,
        lastRef: state.lastRef,
      });
      return;
    }
    if (slotsReady(slots) && !isConfirm(body)) {
      await replyAndSave({
        from,
        accountId,
        inbound,
        history,
        body,
        reply: `Please confirm these details only:\n${summaryLines(slots)}\nReply yes to submit, or tell me what to change.`,
        slots,
        lastRef: state.lastRef,
      });
      return;
    }
  }

  const messages = [
    {
      role: 'system',
      content: [
        `You are the WhatsApp visitor assistant for ${kb.org}.`,
        'Stay inside visitor management only: bookings, host matching, visit status, and the company knowledge below.',
        'If asked for programming, code, homework, or anything outside reception, politely refuse and return to the booking.',
        'Write like a calm receptionist. Short, clear, professional. No asterisks, no markdown, no bullet stars, no emojis unless the visitor uses them.',
        `Never say "How can I assist you today?" or any generic chatbot greeting. If you need to greet, use exactly: ${FIRST_TIME_WELCOME}`,
        'Collected fields are the only source of truth. Never copy name, company, purpose, date, time, or host from an older booking in the chat history.',
        'Never invent a visitor name, company, purpose, date, or time. If a field is missing, ask for it. Do not reuse the previous visitor.',
        'A visitor and a host may share the same name. That is valid. Do not assume the visitor is booking themselves.',
        'Do not invent hosts, departments, prices, or policies. Match hosts only with lookup_host or the saved host list.',
        'Never approve or reject a visit. Only the named host on WhatsApp or staff on the panel can do that.',
        'When every field is present and the visitor confirms, call book_visit using only the collected fields. Then confirm the reference in plain text.',
        `Collected fields so far:\n${summaryLines(slots)}`,
        missing ? `Next missing field: ${missing}. Ask only for that.` : 'All booking fields are present. Confirm once, then book.',
        kb.instruction ? `Business instructions:\n${kb.instruction}` : '',
        kb.rules ? `Business rules:\n${kb.rules}` : '',
        kb.qa ? `FAQs:\n${kb.qa}` : '',
        kb.documents ? `Company documents:\n${kb.documents}` : '',
        `Saved hosts:\n${kb.hostLines}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
    ...history,
    { role: 'user', content: body },
  ];

  if (!process.env.OPENAI_API_KEY) {
    const reply = slotsReady(slots)
      ? `I have these details:\n${summaryLines(slots)}\nReply yes to submit the request.`
      : askFor(missing);
    history = [...history, { role: 'user', content: body }, { role: 'assistant', content: reply }].slice(-20);
    await persistTurn(from, accountId, inbound.replyJid, history, { slots, lastRef: state.lastRef });
    await sendText(from, reply, sendOpts(inbound));
    return;
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  let reply = '';
  let bookedRef = state.lastRef;
  let bookedDone = false;

  try {
    for (let i = 0; i < 5; i += 1) {
      const completion = await client.chat.completions.create({
        model,
        messages,
        tools: TOOLS,
        temperature: 0,
        max_tokens: 280,
      });
      const choice = completion.choices?.[0];
      const assistant = choice?.message;
      if (!assistant) break;
      messages.push(assistant);
      if (choice.finish_reason === 'tool_calls' || assistant.tool_calls?.length) {
        for (const call of assistant.tool_calls || []) {
          let args = {};
          try {
            args = JSON.parse(call.function.arguments || '{}');
          } catch {
            args = {};
          }
          const result = await runTool(call.function.name, args, inbound, slots);
          if (result.host) {
            slots = mergeSlots(slots, {
              hostName: result.host.name,
              hostId: result.host.id,
              hostDept: result.host.department,
            });
          }
          if (result.ok && result.ref) {
            bookedRef = result.ref;
            slots = emptySlots();
            bookedDone = true;
            if (result.text) reply = result.text;
          }
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
        }
        if (bookedDone) break;
        continue;
      }
      if (!bookedDone) reply = cleanReply(assistant.content || '');
      break;
    }
  } catch (err) {
    console.error('Visitor agent failed:', err.message);
    reply = '';
  }

  if (/how can i assist you today/i.test(reply)) {
    reply = missing ? askFor(missing) : FIRST_TIME_WELCOME;
  }

  if (!reply) {
    reply = bookedRef
      ? `Your visit request is in. Reference ${bookedRef}.`
      : slotsReady(slots)
        ? `I have these details:\n${summaryLines(slots)}\nShall I submit this visit request?`
        : askFor(missing);
  }

  history = [...history, { role: 'user', content: body }, { role: 'assistant', content: reply }].slice(-20);
  await persistTurn(from, accountId, inbound.replyJid, history, { slots, lastRef: bookedRef });
  const sent = await sendText(from, reply, sendOpts(inbound));
  if (!sent) console.error('Visitor agent reply was not delivered');
}
