// Answers visitor questions from the company knowledge base. Never touches booking slots.
import OpenAI from 'openai';
import { KNOWLEDGE_DEFAULTS } from '../config/knowledgeDefaults.js';
import { Knowledge } from '../models/index.js';
import { normalizeText } from './hostMatch.js';
import { t } from './messages.js';

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

function plain(text) {
  return String(text || '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function answerQuestion({ question, lang = 'en', orgName = 'Botho Innovations', hosts = [] }) {
  const kb = await loadKnowledge();
  if (!process.env.OPENAI_API_KEY) return keywordAnswer(question, kb.qa) || t(lang, 'faq.fallback');

  const language = lang === 'tn' ? 'Setswana' : 'English';
  const hostLines = hosts.map((h) => `${h.name}${h.department && h.department !== '—' ? ` (${h.department})` : ''}`).join('\n');
  const system = [
    `You answer visitor questions for the ${orgName} reception on WhatsApp.`,
    `Reply only in ${language}. If ${language} is Setswana, write natural, correct Setswana.`,
    'Answer only from the company information below. If the answer is not there, reply exactly with:',
    t(lang, 'faq.fallback'),
    'One to three short sentences. Plain text only: no markdown, no asterisks, no bullet points, no emojis.',
    'Do not ask the visitor for booking details, do not confirm or create bookings, and do not approve or reject visits.',
    'Refuse programming, homework, and anything unrelated to visiting the company.',
    'Never invent staff, departments, prices, or policies.',
    kb.instruction ? `Company instructions:\n${kb.instruction}` : '',
    kb.rules ? `Company rules:\n${kb.rules}` : '',
    kb.qa.length ? `FAQs:\n${kb.qa.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')}` : '',
    kb.documents ? `Company documents:\n${kb.documents}` : '',
    hostLines ? `People and departments visitors can see:\n${hostLines}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 220,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: question },
      ],
    });
    const reply = plain(completion.choices?.[0]?.message?.content);
    if (reply && !/how can i (assist|help) you( today)?/i.test(reply)) return reply;
  } catch (err) {
    console.error('FAQ answer failed:', err.message);
  }
  return keywordAnswer(question, kb.qa) || t(lang, 'faq.fallback');
}
