import { useEffect, useState } from 'react';
import { BookOpen, Plus, Trash2 } from 'lucide-react';
import api from '../api/client';

export default function KnowledgeBase({ onToast }) {
  const [items, setItems] = useState([]);
  const [greeting, setGreeting] = useState('');
  const [instruction, setInstruction] = useState('');
  const [q, setQ] = useState('');
  const [a, setA] = useState('');
  const [busy, setBusy] = useState(false);

  const greetingRow = items.find((i) => i.kind === 'greeting');
  const instructionRow = items.find((i) => i.kind === 'instruction');
  const faqs = items.filter((i) => i.kind === 'qa');

  async function load() {
    const { data } = await api.get('/host/knowledge');
    const rows = Array.isArray(data) ? data : [];
    setItems(rows);
    setGreeting(rows.find((i) => i.kind === 'greeting')?.answer || '');
    setInstruction(rows.find((i) => i.kind === 'instruction')?.answer || '');
  }

  useEffect(() => {
    load().catch(() => onToast?.('Could not load knowledge base', true));
  }, []);

  async function saveKind(kind, answer, existing) {
    setBusy(true);
    try {
      if (existing) await api.patch(`/host/knowledge/${existing.id}`, { kind, answer });
      else await api.post('/host/knowledge', { kind, title: kind, answer });
      await load();
      onToast?.('Saved');
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

  return (
    <div className="ap-panel">
      <div className="ap-panel-head">
        <div className="ap-panel-title">
          <span className="ap-panel-ic">
            <BookOpen size={16} strokeWidth={2} />
          </span>
          <div>
            <h3>Train the WhatsApp AI agent</h3>
            <p>Greeting, extra instructions, and Q&amp;A the visitor bot will use</p>
          </div>
        </div>
      </div>
      <div className="kb-body">
        <div className="ap-f-field">
          <label>Greeting message</label>
          <textarea rows={3} value={greeting} onChange={(e) => setGreeting(e.target.value)} placeholder="Welcome! I can help you book a visit…" />
          <button className="ap-btn ap-btn-sm ap-btn-teal" style={{ marginTop: 10 }} disabled={busy} onClick={() => saveKind('greeting', greeting, greetingRow)}>
            Save greeting
          </button>
        </div>
        <div className="ap-f-field">
          <label>Agent instructions</label>
          <textarea rows={3} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Always ask for company name. Office hours are 8am–5pm…" />
          <button className="ap-btn ap-btn-sm ap-btn-ghost" style={{ marginTop: 10 }} disabled={busy} onClick={() => saveKind('instruction', instruction, instructionRow)}>
            Save instructions
          </button>
        </div>
        <div className="kb-faq">
          <h4>Questions &amp; answers</h4>
          {faqs.map((item) => (
            <div className="kb-faq-row" key={item.id}>
              <div>
                <b>{item.question || item.title}</b>
                <p>{item.answer}</p>
              </div>
              <button className="ap-btn ap-btn-sm ap-btn-danger" onClick={() => remove(item.id)} disabled={busy}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <div className="ap-f-field">
            <label>New question</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Where is the office?" />
          </div>
          <div className="ap-f-field">
            <label>Answer</label>
            <textarea rows={2} value={a} onChange={(e) => setA(e.target.value)} placeholder="We are at…" />
          </div>
          <button className="ap-btn ap-btn-teal ap-btn-sm" onClick={addFaq} disabled={busy}>
            <Plus size={14} /> Add question
          </button>
        </div>
      </div>
    </div>
  );
}
