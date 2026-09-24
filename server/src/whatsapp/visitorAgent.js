import OpenAI from 'openai';
import { FIRST_TIME_WELCOME, KNOWLEDGE_DEFAULTS } from '../config/knowledgeDefaults.js';
import { ConversationState, Knowledge, Settings, Visit } from '../models/index.js';
import { formatDateNice } from '../utils/mappers.js';
import { listActiveHosts, resolveHostForNotify } from '../services/hosts.js';
import { createPendingVisit } from '../services/visits.js';
import { sendText } from './sendMessage.js';
import { handleIncomingMessage } from './conversationEngine.js';

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'lookup_host',
      description: 'Find a company host by name or department from the saved host directory. Use this before booking. Never invent a host.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Host name or department, e.g. Boikarabelo or Technology Planning' },
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
          hostName: { type: 'string', description: 'Host name or department from the company directory' },
          hostId: { type: 'number', description: 'Host id returned by lookup_host' },
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

async function buildKnowledgePrompt(accountId) {
  const rows = accountId ? await Knowledge.list(accountId) : [];
  const savedGreeting = String(rows.find((r) => r.kind === 'greeting')?.answer || '').trim();
  const greeting = savedGreeting || KNOWLEDGE_DEFAULTS.greeting;
  const instruction =
    rows.filter((r) => r.kind === 'instruction').map((r) => r.answer).join('\n') || KNOWLEDGE_DEFAULTS.instruction;
  const savedQa = rows.filter((r) => r.kind === 'qa' && (r.question || r.answer));
  const qaSource = savedQa.length
    ? savedQa
    : KNOWLEDGE_DEFAULTS.faqs.map((f) => ({ question: f.question, title: f.question, answer: f.answer }));
  const qa = qaSource.map((r) => `Q: ${r.question || r.title}\nA: ${r.answer}`).join('\n\n');
  const settings = await Settings.get().catch(() => null);
  const org = settings?.org_name || 'Botho Innovations';
  return { greeting, instruction, qa, org };
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

export async function handleVisitorWithAgent({ from, text, ctx, replyJid = null }) {
  const inbound = { ...(ctx || {}), replyJid: replyJid || ctx?.replyJid || null };
  if (!process.env.OPENAI_API_KEY) {
    await handleIncomingMessage({ from, text, accountId: inbound.accountId || 0, hostId: inbound.hostId, replyJid: inbound.replyJid });
    return;
  }

  const accountId = inbound.accountId || 0;
  const kb = await buildKnowledgePrompt(accountId);
  const prior = await ConversationState.findByPhone(from, accountId);
  const history = Array.isArray(prior?.collected_data?.history) ? prior.collected_data.history : [];
  if (!history.length) {
    const welcome = FIRST_TIME_WELCOME;
    await ConversationState.upsert(
      from,
      'ai',
      {
        history: [
          { role: 'user', content: String(text || '').trim() || 'hello' },
          { role: 'assistant', content: welcome },
        ],
      },
      accountId
    );
    await sendText(from, welcome, sendOpts(inbound));
    return;
  }
  const messages = [
    {
      role: 'system',
      content: [
        `You are the WhatsApp booking assistant for ${kb.org}.`,
        'Always ask who they are visiting — host name or department. That saved host is the person who gets the WhatsApp notify.',
        'Match hosts only with lookup_host against the company directory. Never invent a name, department, or phone.',
        'If several hosts match a department, list those names and ask the visitor to pick one. Do not pick randomly.',
        'Collect: visitor name, company, purpose, date (YYYY-MM-DD), time, and the host to notify.',
        'Do not call book_visit until lookup_host has matched one host. Then tell the visitor their reference and that this host will approve.',
        'Answer FAQs from the knowledge base.',
        `On the visitor's first message, reply with this exact welcome and nothing else:\n${FIRST_TIME_WELCOME}`,
        kb.greeting && kb.greeting !== FIRST_TIME_WELCOME ? `Custom greeting if already used:\n${kb.greeting}` : '',
        kb.instruction ? `Extra instructions:\n${kb.instruction}` : '',
        kb.qa ? `Knowledge base:\n${kb.qa}` : '',
        'Keep replies short. Same language as the visitor. Approved visitors get a QR pass and a backup PIN.',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
    ...history.slice(-12),
    { role: 'user', content: String(text || '').trim() || 'hello' },
  ];

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  let reply = '';

  try {
    for (let i = 0; i < 5; i += 1) {
      const completion = await client.chat.completions.create({
        model,
        messages,
        tools: TOOLS,
        temperature: 0.4,
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
          const result = await runTool(call.function.name, args, { ...inbound, from });
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
        }
        continue;
      }
      reply = String(assistant.content || '').trim();
      break;
    }
  } catch (err) {
    console.error('Visitor agent failed:', err.message);
    await handleIncomingMessage({ from, text, accountId, hostId: inbound.hostId, replyJid: inbound.replyJid });
    return;
  }

  if (!reply) reply = kb.greeting || 'How can I help you book a visit?';
  const storedHistory = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: String(m.content || '').slice(0, 2000) }))
    .slice(-16);
  await ConversationState.upsert(from, 'ai', { history: storedHistory }, accountId);
  const sent = await sendText(from, reply, sendOpts(inbound));
  if (!sent) {
    console.error('Visitor agent reply was not delivered');
    await handleIncomingMessage({ from, text, accountId, hostId: inbound.hostId, replyJid: inbound.replyJid });
  }
}

