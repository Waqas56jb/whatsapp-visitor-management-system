import { Knowledge } from '../models/index.js';
import { extractFromUpload, extractFromWebsite } from '../services/extractKnowledge.js';

const KINDS = ['greeting', 'instruction', 'qa', 'rule', 'document', 'website', 'text'];

function mapRow(row) {
  if (!row) return null;
  const answer = String(row.answer || '');
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    question: row.question,
    answer,
    preview: answer.slice(0, 180),
    createdAt: row.created_at,
  };
}

export async function listKnowledge(req, res) {
  if (!req.user?.accountId) return res.status(400).json({ error: 'Account not linked' });
  const rows = await Knowledge.listAll();
  res.json(rows.map(mapRow));
}

export async function createKnowledge(req, res) {
  const accountId = req.user?.accountId;
  if (!accountId) return res.status(400).json({ error: 'Account not linked' });
  const kind = KINDS.includes(req.body.kind) ? req.body.kind : 'qa';
  const answer = String(req.body.answer || '').trim();
  if (!answer) return res.status(400).json({ error: 'Add the text to save' });
  const row = await Knowledge.create({
    account_id: accountId,
    kind,
    title: String(req.body.title || ''),
    question: String(req.body.question || ''),
    answer,
  });
  res.status(201).json(mapRow(row));
}

export async function updateKnowledge(req, res) {
  if (!req.user?.accountId) return res.status(400).json({ error: 'Account not linked' });
  const row = await Knowledge.update(req.params.id, null, {
    kind: req.body.kind,
    title: req.body.title,
    question: req.body.question,
    answer: req.body.answer,
  });
  if (!row) return res.status(404).json({ error: 'Entry not found' });
  res.json(mapRow(row));
}

export async function deleteKnowledge(req, res) {
  if (!req.user?.accountId) return res.status(400).json({ error: 'Account not linked' });
  const row = await Knowledge.remove(req.params.id);
  if (!row) return res.status(404).json({ error: 'Entry not found' });
  res.json({ ok: true });
}

export async function saveTraining(req, res) {
  const accountId = req.user?.accountId;
  if (!accountId) return res.status(400).json({ error: 'Account not linked' });
  const greeting = String(req.body.greeting || '').trim();
  const instruction = String(req.body.instruction || '').trim();
  if (!greeting && !instruction) {
    return res.status(400).json({ error: 'Add a greeting or training text' });
  }
  const greetingRow = greeting
    ? await Knowledge.upsertByKind(accountId, 'greeting', { title: 'greeting', answer: greeting })
    : null;
  const instructionRow = instruction
    ? await Knowledge.upsertByKind(accountId, 'instruction', { title: 'instruction', answer: instruction })
    : null;
  res.json({
    greeting: mapRow(greetingRow),
    instruction: mapRow(instructionRow),
  });
}

export async function uploadKnowledge(req, res) {
  const accountId = req.user?.accountId;
  if (!accountId) return res.status(400).json({ error: 'Account not linked' });
  try {
    const extracted = await extractFromUpload(req.file);
    if (!extracted.text) return res.status(400).json({ error: 'No text could be read from that file' });
    const row = await Knowledge.create({
      account_id: accountId,
      kind: 'document',
      title: extracted.title,
      question: '',
      answer: extracted.text,
    });
    res.status(201).json(mapRow(row));
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not read file' });
  }
}

export async function importWebsite(req, res) {
  const accountId = req.user?.accountId;
  if (!accountId) return res.status(400).json({ error: 'Account not linked' });
  try {
    const extracted = await extractFromWebsite(req.body.url || req.body.link);
    const row = await Knowledge.create({
      account_id: accountId,
      kind: 'website',
      title: extracted.title,
      question: extracted.url,
      answer: extracted.text,
    });
    res.status(201).json(mapRow(row));
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not import that website' });
  }
}
