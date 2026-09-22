import { Knowledge } from '../models/index.js';

function mapRow(row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    question: row.question,
    answer: row.answer,
  };
}

export async function listKnowledge(req, res) {
  const accountId = req.user?.accountId;
  if (!accountId) return res.status(400).json({ error: 'Account not linked' });
  const rows = await Knowledge.list(accountId);
  res.json(rows.map(mapRow));
}

export async function createKnowledge(req, res) {
  const accountId = req.user?.accountId;
  if (!accountId) return res.status(400).json({ error: 'Account not linked' });
  const kind = ['greeting', 'instruction', 'qa'].includes(req.body.kind) ? req.body.kind : 'qa';
  const row = await Knowledge.create({
    account_id: accountId,
    kind,
    title: String(req.body.title || ''),
    question: String(req.body.question || ''),
    answer: String(req.body.answer || ''),
  });
  res.status(201).json(mapRow(row));
}

export async function updateKnowledge(req, res) {
  const accountId = req.user?.accountId;
  if (!accountId) return res.status(400).json({ error: 'Account not linked' });
  const row = await Knowledge.update(req.params.id, accountId, {
    kind: req.body.kind,
    title: req.body.title,
    question: req.body.question,
    answer: req.body.answer,
  });
  if (!row) return res.status(404).json({ error: 'Entry not found' });
  res.json(mapRow(row));
}

export async function deleteKnowledge(req, res) {
  const accountId = req.user?.accountId;
  if (!accountId) return res.status(400).json({ error: 'Account not linked' });
  const row = await Knowledge.remove(req.params.id, accountId);
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
  const greetingRow = await Knowledge.upsertByKind(accountId, 'greeting', {
    title: 'greeting',
    answer: greeting,
  });
  const instructionRow = await Knowledge.upsertByKind(accountId, 'instruction', {
    title: 'instruction',
    answer: instruction,
  });
  res.json({
    greeting: mapRow(greetingRow),
    instruction: mapRow(instructionRow),
  });
}
