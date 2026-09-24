import OpenAI from 'openai';
import { FIRST_TIME_WELCOME, KNOWLEDGE_DEFAULTS } from '../config/knowledgeDefaults.js';
import { ConversationState, Knowledge, Settings, Visit } from '../models/index.js';
import { formatDateNice } from '../utils/mappers.js';
import { listActiveHosts, resolveHostForNotify } from '../services/hosts.js';
import { createPendingVisit } from '../services/visits.js';
import { sendText } from './sendMessage.js';

const memory = new Map();

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'lookup_host',
      description: 'Find a company host by name or department from the saved host directory. Use this before booking. Never invent a host.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Host name or department' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'book_visit',
      description: 'Create a pending visit after the visitor has given their details AND a matched host from lookup_host.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          company: { type: 'string' },
          purpose: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD' },
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

function parseHistory(prior, from, replyJid) {
  const mem = memory.get(memoryKey(from, replyJid));
  const data = prior?.collected_data || {};
  const dbHistory = Array.isArray(data.history) ? data.history : [];
  if (dbHistory.length) return { history: dbHistory, welcomed: Boolean(data.welcomed) || dbHistory.some((m) => m.role === 'assistant') };
  if (mem?.history?.length) return mem;
  return { history: [], welcomed: Boolean(data.welcomed) };
}

function remember(from, replyJid, payload) {
  memory.set(memoryKey(from, replyJid), payload);
}

function clip(text, max = 3500) {
  const value = String(text || '').trim();
  return value.length > max ? `${value.slice(0, max)}\n…` : value;
}

async function buildKnowledgePrompt() {
  const rows = await Knowledge.listAll().catch(() => []);
  const byKind = (kind) => rows.filter((r) => r.kind === kind);
  const savedGreeting = String(byKind('greeting')[0]?.answer || '').trim();
  const greeting = savedGreeting || KNOWLEDGE_DEFAULTS.greeting;
  const instruction =
    byKind('instruction').map((r) => r.answer).filter(Boolean).join('\n') || KNOWLEDGE_DEFAULTS.instruction;
  const rules = byKind('rule')
    .map((r) => `- ${r.title ? `${r.title}: ` : ''}${r.answer}`)
    .join('\n');
  const savedQa = byKind('qa').filter((r) => r.question || r.answer);
  const qaSource = savedQa.length
    ? savedQa
    : KNOWLEDGE_DEFAULTS.faqs.map((f) => ({ question: f.question, title: f.question, answer: f.answer }));
  const qa = qaSource.map((r) => `Q: ${r.question || r.title}\nA: ${r.answer}`).join('\n\n');
  const documents = [...byKind('document'), ...byKind('text'), ...byKind('website')]
    .map((r) => {
      const label = r.title || r.question || 'Source';
      const link = r.kind === 'website' && r.question ? ` (${r.question})` : '';
      return `### ${label}${link}\n${clip(r.answer)}`;
    })
    .join('\n\n');
  const settings = await Settings.get().catch(() => null);
  const org = settings?.org_name || 'Botho Innovations';
  const hosts = await listActiveHosts().catch(() => []);
  const hostLines = hosts.length
    ? hosts.map((h) => `- ${h.name}${h.department ? ` (${h.department})` : ''}`).join('\n')
    : 'No hosts saved yet.';
  return { greeting, instruction, rules, qa, documents, org, hostLines };
}

async function runTool(name, args, ctx) {
  if (name === 'lookup_host') {
    const resolved = await resolveHostForNotify(args.query);
    if (resolved.host) return { ok: true, host: resolved.host };
    const directory = await listActiveHosts();
    return {
      error: resolved.error,
      matches: resolved.matches || [],
      directory: directory.slice(0, 12),
    };
  }
  if (name === 'book_visit') {
    const resolved = args.hostId
      ? { host: { id: args.hostId } }
      : await resolveHostForNotify(args.hostName);
    if (!resolved.host) {
      return {
        error: resolved.error || 'Ask who they are visiting. Use lookup_host first.',
        matches: resolved.matches || [],
      };
    }
    const visit = await createPendingVisit({
      name: args.name,
      company: args.company || '—',
      hostId: resolved.host.id,
      purpose: args.purpose,
      date: args.date,
      time: args.time,
      visitType: args.visitType === 'social' ? 'social' : 'official',
      visitorPhone: ctx.from,
      actor: args.name || 'Visitor',
      notify: true,
    });
    await ConversationState.clear(ctx.from, ctx.accountId || 0);
    memory.delete(memoryKey(ctx.from, ctx.replyJid));
    return {
      ok: true,
      ref: visit.ref_number,
      status: visit.status,
      host: visit.host_name,
      note: `${visit.host_name} has been notified on their saved WhatsApp number.`,
    };
  }
  if (name === 'check_status') {
    const visit = await Visit.findByRef(args.ref);
    if (!visit) return { error: 'Visit not found' };
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
  const payload = { welcomed: true, history, ...extra };
  remember(from, replyJid, payload);
  await ConversationState.upsert(from, 'ai', payload, accountId).catch((err) => {
    console.error('Conversation persist failed:', err.message);
  });
}

export async function handleVisitorWithAgent({ from, text, ctx, replyJid = null }) {
  const inbound = { ...(ctx || {}), from, replyJid: replyJid || ctx?.replyJid || null };
  const accountId = inbound.accountId || 0;
  const body = String(text || '').trim() || 'hello';
  const kb = await buildKnowledgePrompt();
  const prior = await ConversationState.findByPhone(from, accountId);
  const { history, welcomed } = parseHistory(prior, from, inbound.replyJid);

  if (!welcomed) {
    const welcome = FIRST_TIME_WELCOME;
    const nextHistory = [
      { role: 'user', content: body },
      { role: 'assistant', content: welcome },
    ];
    await persistTurn(from, accountId, inbound.replyJid, nextHistory);
    await sendText(from, welcome, sendOpts(inbound));
    return;
  }

  const messages = [
    {
      role: 'system',
      content: [
        `You are the live WhatsApp assistant for ${kb.org}. Talk naturally, in the visitor's language, one short message at a time.`,
        'Have a real conversation. Never repeat the welcome message after it has already been sent.',
        'Collect only missing booking fields: visitor name, company, purpose, date, time, and the host to notify.',
        'Always ask who they are visiting if that is missing. Match hosts only with lookup_host. Never invent a host, department, phone, service, price, or policy.',
        'If several hosts match, list those names and ask the visitor to pick one.',
        'Do not call book_visit until lookup_host matched one host and the required fields are present.',
        'Answer company questions ONLY from the knowledge below (rules, FAQs, documents, websites) plus the host directory. If it is not there, say you do not have that information and offer to book a visit.',
        kb.instruction ? `Business instructions:\n${kb.instruction}` : '',
        kb.rules ? `Business rules:\n${kb.rules}` : '',
        kb.qa ? `FAQs:\n${kb.qa}` : '',
        kb.documents ? `Company documents and website text:\n${kb.documents}` : '',
        `Saved hosts (notify only these people):\n${kb.hostLines}`,
        'Approved visitors get a QR pass and a backup PIN.',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
    ...history.slice(-16),
    { role: 'user', content: body },
  ];

  if (!process.env.OPENAI_API_KEY) {
    const fallback = 'Thanks. Please send any missing details: name, company, purpose, date, time, and the host you want to see.';
    await persistTurn(from, accountId, inbound.replyJid, [...history, { role: 'user', content: body }, { role: 'assistant', content: fallback }]);
    await sendText(from, fallback, sendOpts(inbound));
    return;
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  let reply = '';

  try {
    for (let i = 0; i < 5; i += 1) {
      const completion = await client.chat.completions.create({
        model,
        messages,
        tools: TOOLS,
        temperature: 0.3,
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
          const result = await runTool(call.function.name, args, inbound);
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
        }
        continue;
      }
      reply = String(assistant.content || '').trim();
      break;
    }
  } catch (err) {
    console.error('Visitor agent failed:', err.message);
    reply = 'I can help you book a visit. Please send your name, company, purpose, date, time, and the host you want to see.';
  }

  if (!reply || reply === FIRST_TIME_WELCOME || reply === kb.greeting) {
    reply = 'Thanks — I have that. Who are you visiting? Please send the host name or department.';
  }

  const storedHistory = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: String(m.content || '').slice(0, 2000) }))
    .slice(-20);
  if (!storedHistory.some((m) => m.role === 'assistant' && m.content === reply)) {
    storedHistory.push({ role: 'assistant', content: reply });
  }
  await persistTurn(from, accountId, inbound.replyJid, storedHistory);
  const sent = await sendText(from, reply, sendOpts(inbound));
  if (!sent) console.error('Visitor agent reply was not delivered');
}
