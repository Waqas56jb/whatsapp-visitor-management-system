import { useEffect, useState } from 'react';
import { BookOpen, Plus, RotateCcw, Trash2 } from 'lucide-react';
import api from '../api/client';

const DEFAULT_GREETING =
  'Welcome to Botho Innovations Visitor Management System. Please provide your details (Names, Company, Purpose, Visit date, Time).';
const DEFAULT_INSTRUCTION =
  'Always ask who they are visiting (host name or department). Notify only that saved host. Always ask for company name. Office hours are 8am–5pm.';
const DEFAULT_FAQS = [
  {
    question: 'Where is the office?',
    answer: 'We are at Botho Innovations reception. Please check in at the front desk.',
  },
];

export default function KnowledgeBase({ onToast }) {
  const [items, setItems] = useState([]);
  const [greeting, setGreeting] = useState(DEFAULT_GREETING);
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION);
  const [q, setQ] = useState('');
  const [a, setA] = useState('');
  const [busy, setBusy] = useState(false);

  const greetingRow = items.find((i) => i.kind === 'greeting');
  const instructionRow = items.find((i) => i.kind === 'instruction');
  const faqs = items.filter((i) => i.kind === 'qa');
  const customized = Boolean(greetingRow || instructionRow || faqs.length);

  async function load() {
    const { data } = await api.get('/host/knowledge');
    const rows = Array.isArray(data) ? data : [];
    setItems(rows);
    setGreeting(rows.find((i) => i.kind === 'greeting')?.answer || DEFAULT_GREETING);
    setInstruction(rows.find((i) => i.kind === 'instruction')?.answer || DEFAULT_INSTRUCTION);
  }

  useEffect(() => {
    load().catch(() => onToast?.('Could not load knowledge base', true));
  }, []);

  async function saveKind(kind, answer, existing) {
    if (!String(answer || '').trim()) {
      onToast?.('This field cannot be empty', true);
      return;
    }
    setBusy(true);
    try {
      if (existing) await api.patch(`/host/knowledge/${existing.id}`, { kind, answer: answer.trim() });
      else await api.post('/host/knowledge', { kind, title: kind, answer: answer.trim() });
      await load();
      onToast?.('Saved — visitor WhatsApp bot will use your edit');
    } catch (err) {
      onToast?.(err.response?.data?.error || 'Could not save', true);
    } finally {
      setBusy(false);
    }
  }

  async function addFaq() {
    if (!q.trim() || !a.trim()) {
      onToast?.('Add both a question and an answer', true);
      return;
    }
    setBusy(true);
    try {
      await api.post('/host/knowledge', { kind: 'qa', title: q.trim(), question: q.trim(), answer: a.trim() });
      setQ('');
      setA('');
      await load();
      onToast?.('Question added');
    } catch (err) {
      onToast?.(err.response?.data?.error || 'Could not add question', true);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    setBusy(true);
    try {
      await api.delete(`/host/knowledge/${id}`);
      await load();
    } catch {
      onToast?.('Could not delete', true);
    } finally {
      setBusy(false);
    }
  }

  function resetDefaults() {
    setGreeting(DEFAULT_GREETING);
    setInstruction(DEFAULT_INSTRUCTION);
    setQ('');
    setA('');
    onToast?.('Default text restored in the form. Save to apply.');
  }

  return (
    <div className="ap-panel">
      <div className="ap-panel-head">
        <div className="ap-panel-title">
          <span className="ap-panel-ic">
            <BookOpen size={16} strokeWidth={2} />
          </span>
          <div>
            <h3>Train the WhatsApp AI agent</h3>
            <p>Defaults are set in code. Edit any field and save — the visitor bot uses your version.</p>
          </div>
        </div>
        <div className="kb-head-actions">
          <span className={'ap-badge ' + (customized ? 'approved' : 'pending')}>
            {customized ? 'Custom' : 'Default'}
          </span>
          <button className="ap-btn ap-btn-ghost ap-btn-sm" type="button" disabled={busy} onClick={resetDefaults}>
            <RotateCcw size={14} /> Reset to default
          </button>
        </div>
      </div>
      <div className="kb-body">
        <div className="ap-f-field">
          <label>Greeting message</label>
          <textarea rows={3} value={greeting} onChange={(e) => setGreeting(e.target.value)} />
          <button
            className="ap-btn ap-btn-sm ap-btn-teal"
            style={{ marginTop: 10 }}
            disabled={busy}
            onClick={() => saveKind('greeting', greeting, greetingRow)}
          >
            Save greeting
          </button>
        </div>
        <div className="ap-f-field">
          <label>Agent instructions</label>
          <textarea rows={3} value={instruction} onChange={(e) => setInstruction(e.target.value)} />
          <button
            className="ap-btn ap-btn-sm ap-btn-ghost"
            style={{ marginTop: 10 }}
            disabled={busy}
            onClick={() => saveKind('instruction', instruction, instructionRow)}
          >
            Save instructions
          </button>
        </div>
        <div className="kb-faq">
          <h4>Questions &amp; answers</h4>
          {faqs.length ? (
            faqs.map((item) => (
              <div className="kb-faq-row" key={item.id}>
                <div>
                  <b>{item.question || item.title}</b>
                  <p>{item.answer}</p>
                </div>
                <button className="ap-btn ap-btn-sm ap-btn-danger" onClick={() => remove(item.id)} disabled={busy}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          ) : (
            DEFAULT_FAQS.map((item) => (
              <div className="kb-faq-row kb-faq-default" key={item.question}>
                <div>
                  <b>{item.question}</b>
                  <p>{item.answer}</p>
                  <em>Default — add your own below to replace this</em>
                </div>
              </div>
            ))
          )}
          <div className="ap-f-field">
            <label>New question</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Where is the parking?" />
          </div>
          <div className="ap-f-field">
            <label>Answer</label>
            <textarea rows={2} value={a} onChange={(e) => setA(e.target.value)} placeholder="Visitor parking is at the basement." />
          </div>
          <button className="ap-btn ap-btn-teal ap-btn-sm" onClick={addFaq} disabled={busy}>
            <Plus size={14} /> Add question
          </button>
        </div>
      </div>
    </div>
  );
}
