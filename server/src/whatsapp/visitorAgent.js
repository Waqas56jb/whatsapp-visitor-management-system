import OpenAI from 'openai';
import { ConversationState, Knowledge, Settings, Visit } from '../models/index.js';
import { formatDateNice } from '../utils/mappers.js';
import { createPendingVisit } from '../services/visits.js';
import { sendText } from './sendMessage.js';
import { handleIncomingMessage } from './conversationEngine.js';

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'book_visit',
      description: 'Create a pending visit booking for this host after the visitor has given name, date, time and purpose.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          company: { type: 'string' },
          purpose: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD' },
          time: { type: 'string' },
          visitType: { type: 'string', enum: ['official', 'social'] },
        },
        required: ['name', 'purpose', 'date', 'time'],
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
  return { accountId: ctx.accountId || null };
}

async function buildKnowledgePrompt(accountId) {
  const rows = accountId ? await Knowledge.list(accountId) : [];
  const greeting = rows.find((r) => r.kind === 'greeting')?.answer || '';
  const instruction = rows.filter((r) => r.kind === 'instruction').map((r) => r.answer).join('\n');
  const qa = rows
    .filter((r) => r.kind === 'qa' && (r.question || r.answer))
    .map((r) => `Q: ${r.question || r.title}\nA: ${r.answer}`)
    .join('\n\n');
  const settings = await Settings.get().catch(() => null);
  const org = settings?.org_name || 'Botho Innovations';
  return { greeting, instruction, qa, org };
}

async function runTool(name, args, ctx) {
  if (name === 'book_visit') {
    if (!ctx.hostId) return { error: 'This WhatsApp is not linked to a host account.' };
    const visit = await createPendingVisit({
      name: args.name,
      company: args.company || '—',
      hostId: ctx.hostId,
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
      note: 'Booking is pending host approval. The host has been notified on WhatsApp.',
    };
  }
  if (name === 'check_status') {
    const visit = await Visit.findByRef(args.ref);
    if (!visit) return { error: 'Visit not found' };
    if (ctx.hostId && Number(visit.host_id) !== Number(ctx.hostId)) return { error: 'Visit not found' };
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

export async function handleVisitorWithAgent({ from, text, ctx }) {
  if (!process.env.OPENAI_API_KEY) {
    await handleIncomingMessage({ from, text, accountId: ctx.accountId || 0, hostId: ctx.hostId });
    return;
  }
  if (!ctx.hostId) {
    await handleIncomingMessage({ from, text, accountId: ctx.accountId || 0 });
    return;
  }

  const accountId = ctx.accountId || 0;
  const kb = await buildKnowledgePrompt(accountId);
  const prior = await ConversationState.findByPhone(from, accountId);
  const history = Array.isArray(prior?.collected_data?.history) ? prior.collected_data.history : [];
  const messages = [
    {
      role: 'system',
      content: [
        `You are the WhatsApp booking assistant for ${kb.org}.`,
        `You speak for host account "${ctx.hostName || 'the host'}". Bookings always go to this host — do not ask who they are visiting.`,
        'Collect: full name, company (if official), purpose, date (YYYY-MM-DD), time, and social vs official.',
        'When you have enough, call book_visit. Then tell the visitor their reference and that the host will approve.',
        'Answer FAQs from the knowledge base. Use the greeting on the first turn.',
        kb.greeting ? `Greeting to use:\n${kb.greeting}` : '',
        kb.instruction ? `Extra instructions:\n${kb.instruction}` : '',
        kb.qa ? `Knowledge base:\n${kb.qa}` : '',
        'Keep replies short. Same language as the visitor. No PIN — approved visitors get a QR pass.',
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
          const result = await runTool(call.function.name, args, { ...ctx, from });
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
        }
        continue;
      }
      reply = String(assistant.content || '').trim();
      break;
    }
  } catch (err) {
    console.error('Visitor agent failed:', err.message);
    await handleIncomingMessage({ from, text, accountId, hostId: ctx.hostId });
    return;
  }

  if (!reply) reply = kb.greeting || 'How can I help you book a visit?';
  const storedHistory = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: String(m.content || '').slice(0, 2000) }))
    .slice(-16);
  await ConversationState.upsert(from, 'ai', { history: storedHistory }, accountId);
  await sendText(from, reply, sendOpts(ctx));
}
