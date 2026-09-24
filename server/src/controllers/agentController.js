import OpenAI from 'openai';
import { ConversationLog, Visit } from '../models/index.js';
import { mapVisit } from '../utils/mappers.js';
import { decideVisit } from '../services/visits.js';

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_visits',
      description: 'List visit requests routed to the logged-in host.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['all', 'pending', 'approved', 'rejected', 'used'],
            description: 'Filter by visit status. Default all.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'decide_visit',
      description:
        'Approve or reject a pending visit for this host. Approving sends the visitor a QR pass image on WhatsApp.',
      parameters: {
        type: 'object',
        properties: {
          ref: { type: 'string', description: 'Visit reference like VMS-2026-001245' },
          visitor: { type: 'string', description: 'Visitor name if the reference is unknown' },
          decision: { type: 'string', enum: ['approved', 'rejected'] },
        },
        required: ['decision'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_conversations',
      description: 'List WhatsApp conversation threads tied to this host’s visits.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

function summarizeVisit(v) {
  return {
    id: v.id,
    ref: v.ref,
    visitor: v.visitor,
    purpose: v.purpose,
    date: v.date,
    time: v.time,
    status: v.status,
    visitType: v.visitType,
    visitorPhone: v.visitorPhone || null,
  };
}

async function runTool(name, args, req) {
  if (name === 'list_visits') {
    const status = args.status && args.status !== 'all' ? args.status : undefined;
    const rows = (await Visit.list({ status })).map(mapVisit).map(summarizeVisit);
    return { count: rows.length, visits: rows.slice(0, 30) };
  }

  if (name === 'decide_visit') {
    const visits = (await Visit.list()).map(mapVisit);
    const ref = String(args.ref || '').trim();
    const visitor = String(args.visitor || '').trim().toLowerCase();
    const match = visits.find((v) => {
      if (ref && String(v.ref).toLowerCase() === ref.toLowerCase()) return true;
      if (visitor && String(v.visitor || '').toLowerCase() === visitor) return v.status === 'pending' || !ref;
      return false;
    }) || visits.find((v) => visitor && String(v.visitor || '').toLowerCase().includes(visitor) && v.status === 'pending');

    if (!match) return { error: 'No matching visit found for this host.' };
    const result = await decideVisit({
      visitId: match.id,
      decision: args.decision === 'rejected' ? 'rejected' : 'approved',
      actor: req.user?.name || 'Host',
    });
    const visit = mapVisit(result.visit);
    return {
      alreadyDecided: result.alreadyDecided,
      visit: summarizeVisit(visit),
      note:
        args.decision === 'approved'
          ? 'Visitor will receive the QR pass image on WhatsApp if a phone number is on file.'
          : 'Visitor will be notified of the rejection on WhatsApp if a phone number is on file.',
    };
  }

  if (name === 'list_conversations') {
    const rows = await ConversationLog.listThreads();
    return {
      count: rows.length,
      threads: rows.slice(0, 20).map((row) => ({
        phone: row.phone,
        visitorName: row.visitor_name || null,
        lastMessage: row.last_message || '',
        messageCount: Number(row.message_count || 0),
        lastAt: row.last_at,
      })),
    };
  }

  return { error: `Unknown tool ${name}` };
}

function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
}

export async function hostAgentChat(req, res) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'OpenAI is not configured. Add OPENAI_API_KEY to the server .env and restart.',
    });
  }
  const message = String(req.body.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Message is required' });

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const messages = [
    {
      role: 'system',
      content: [
        'You are the Botho Innovations host assistant in the client portal.',
        `The logged-in host is ${req.user.name || 'a host'}.`,
        'Answer in the same language the host uses (English or Urdu/Roman Urdu).',
        'You can look up their visits, approve or reject pending requests, and summarize WhatsApp threads.',
        'When a visit is approved, the visitor receives a QR image on WhatsApp (host, date, time, location). There is no PIN.',
        'Never invent visit data. Use tools. Confirm before rejecting if the host is ambiguous.',
        'Keep replies short and practical.',
      ].join(' '),
    },
    ...sanitizeHistory(req.body.history),
    { role: 'user', content: message },
  ];

  try {
    let reply = '';
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
          const result = await runTool(call.function.name, args, req);
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(result),
          });
        }
        continue;
      }

      reply = String(assistant.content || '').trim();
      break;
    }

    if (!reply) reply = 'I could not complete that request. Try again with a visit name or reference.';
    res.json({ reply });
  } catch (err) {
    console.error('Host agent failed:', err.message);
    const status = err.status === 401 ? 502 : err.status || 500;
    res.status(status).json({
      error: err.status === 401 ? 'OpenAI rejected the API key.' : err.message || 'Agent failed',
    });
  }
}
