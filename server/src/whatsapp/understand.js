// AI understanding for messages the rule-based parser could not act on. The model only decides WHICH
// operation the visitor wants; the booking engine then validates and performs it (slots, ownership,
// office hours), so the model can never book an invalid slot or change someone else's visit.
import OpenAI from 'openai';
import { formatVisitDate, formatVisitTime } from './messages.js';

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'cancel_visit',
      description: 'The visitor wants to cancel one of their own upcoming visits.',
      parameters: { type: 'object', properties: { ref: { type: 'string', description: 'VMS reference if known' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_visit',
      description: 'The visitor wants to move (reschedule/shift) one of their own upcoming visits to a new date and/or time.',
      parameters: {
        type: 'object',
        properties: {
          ref: { type: 'string', description: 'VMS reference of the visit to move, if it can be identified' },
          new_date: { type: 'string', description: 'New date as YYYY-MM-DD, if given' },
          new_time: { type: 'string', description: 'New time as HH:mm (24h), if given' },
        },
      },
    },
  },
  {
    type: 'function',
    function: { name: 'check_status', description: 'The visitor wants to know the status of their visit requests.', parameters: { type: 'object', properties: {} } },
  },
  {
    type: 'function',
    function: {
      name: 'free_slots',
      description: 'The visitor wants to know when a host is free or which times are booked.',
      parameters: {
        type: 'object',
        properties: {
          host: { type: 'string', description: 'Host name or department exactly as in the host list' },
          date: { type: 'string', description: 'Date as YYYY-MM-DD, if given' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'answer_question',
      description: 'Anything else: a question about the company, their visit, or general conversation.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

// Turns the chosen operation into a plain command the booking engine already understands.
function toCommand(name, args) {
  if (name === 'cancel_visit') return `cancel ${args.ref || ''}`.trim();
  if (name === 'move_visit') {
    const to = [args.new_date, args.new_time].filter(Boolean).join(' ');
    return `reschedule ${args.ref || 'my visit'}${to ? ` to ${to}` : ''}`;
  }
  if (name === 'check_status') return 'status';
  if (name === 'free_slots') return `free slots for ${args.host || ''} ${args.date || ''}`.replace(/\s+/g, ' ').trim();
  return null;
}

export async function understandMessage({ message, visits = [], hosts = [], history = [], today }) {
  if (!process.env.OPENAI_API_KEY) return null;
  const visitLines = visits.length
    ? visits.map((v) => `${v.ref} | host ${v.host} | ${formatVisitDate(v.date, 'en')} at ${formatVisitTime(v.time, 'en')} | ${v.status}`).join('\n')
    : 'none';
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 150,
      tool_choice: 'required',
      tools: TOOLS,
      messages: [
        {
          role: 'system',
          content: [
            'Classify the visitor’s latest WhatsApp message into exactly one operation for a visitor-management reception.',
            'Messages may be in English, Setswana, or a mix, and may contain typos.',
            `Today is ${today}. Resolve relative dates (tomorrow, Monday) to YYYY-MM-DD and times to 24h HH:mm.`,
            'When the visitor refers to a visit by its time, host, or date ("my 3pm meeting"), pick the matching reference from their visits.',
            `Their visits:\n${visitLines}`,
            `Hosts:\n${hosts.map((h) => h.name + (h.department && h.department !== '—' ? ` (${h.department})` : '')).join('\n')}`,
          ].join('\n\n'),
        },
        ...history.slice(-8),
        { role: 'user', content: message },
      ],
    });
    const call = completion.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return null;
    let args = {};
    try {
      args = JSON.parse(call.function.arguments || '{}');
    } catch {
      args = {};
    }
    return toCommand(call.function.name, args);
  } catch (err) {
    console.error('Message understanding failed:', err.message);
    return null;
  }
}
