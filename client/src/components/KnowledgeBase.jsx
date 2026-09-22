import { useEffect, useState } from 'react';
import { BookOpen, Plus, Trash2 } from 'lucide-react';
import api from '../api/client';

const DEFAULT_GREETING = `Welcome to Botho Innovations. I can help you book a visit.

Please send your full name to get started.`;

const DEFAULT_TRAINING = `You are the WhatsApp visitor booking assistant for Botho Innovations.

Office hours: Monday to Friday, 8:00am–5:00pm. Closed weekends and public holidays.
Location: Botho Innovations, reception / lobby. Visitors must check in at reception.
Always ask for: full name, company name, purpose of visit, preferred date (YYYY-MM-DD), and time.
If the visit is official, company name is required. If social, company can be skipped.
Do not ask which host they want — bookings always go to this host.
After booking, tell them their reference number and that the host will approve on WhatsApp.
When approved they receive a QR pass and a backup PIN. At reception they scan the QR or type the PIN.
Parking is available for visitors. Bring a valid ID.
Keep replies short. Reply in the same language as the visitor.`;

const DEFAULT_QUESTION = 'Where is the office?';
const DEFAULT_ANSWER = 'Botho Innovations reception / lobby. Please check in at the front desk. Office hours are 8:00am–5:00pm, Monday to Friday.';

export default function KnowledgeBase({ onToast }) {
  const [items, setItems] = useState([]);
  const [greeting, setGreeting] = useState(DEFAULT_GREETING);
  const [instruction, setInstruction] = useState(DEFAULT_TRAINING);
  const [q, setQ] = useState(DEFAULT_QUESTION);
  const [a, setA] = useState(DEFAULT_ANSWER);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const faqs = items.filter((i) => i.kind === 'qa');

  async function load() {
    const { data } = await api.get('/host/knowledge');
    const rows = Array.isArray(data) ? data : [];
    setItems(rows);
    const savedGreeting = rows.find((i) => i.kind === 'greeting')?.answer;
    const savedInstruction = rows.find((i) => i.kind === 'instruction')?.answer;
    setGreeting(savedGreeting || DEFAULT_GREETING);
    setInstruction(savedInstruction || DEFAULT_TRAINING);
    if (savedGreeting || savedInstruction) setSaved(true);
  }

  useEffect(() => {
    load().catch(() => onToast?.('Could not load knowledge base', true));
  }, []);

  async function saveTraining(e) {
    e?.preventDefault();
    if (!greeting.trim() && !instruction.trim()) {
      onToast?.('Fill at least one of the two training fields', true);
      return;
    }
    setBusy(true);
    try {
      await api.put('/host/knowledge/training', {
        greeting: greeting.trim(),
        instruction: instruction.trim(),
      });
      await load();
      setSaved(true);
      onToast?.('Training saved — WhatsApp visitor bot will use this');
    } catch (err) {
      onToast?.(err.response?.data?.error || 'Could not save training', true);
    } finally {
      setBusy(false);
    }
  }

  async function addFaq(e) {
    e?.preventDefault();
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
      onToast?.('Question added to the visitor bot');
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
            <p>Two fields only. Save once — the visitor bot uses this on WhatsApp.</p>
          </div>
        </div>
        {saved || greeting || instruction ? (
          <span className="ap-badge approved">Trained</span>
        ) : (
          <span className="ap-badge pending">Not trained</span>
        )}
      </div>

      <form className="kb-body" onSubmit={saveTraining}>
        <div className="ap-f-field">
          <label htmlFor="kbGreeting">1. Greeting message</label>
          <textarea
            id="kbGreeting"
            rows={4}
            value={greeting}
            onChange={(e) => {
              setSaved(false);
              setGreeting(e.target.value);
            }}
            placeholder="Welcome to Botho Innovations. I can help you book a visit. What is your full name?"
          />
        </div>
        <div className="ap-f-field">
          <label htmlFor="kbTraining">2. Training knowledge</label>
          <textarea
            id="kbTraining"
            rows={8}
            value={instruction}
            onChange={(e) => {
              setSaved(false);
              setInstruction(e.target.value);
            }}
            placeholder="Office hours 8am–5pm. Address: … Always ask company name. Parking at basement. Reception validates QR or PIN."
          />
        </div>
        <button className="ap-btn ap-btn-teal" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save training'}
        </button>
      </form>

      <div className="kb-faq">
        <h4>Optional: add a question &amp; answer</h4>
        <p className="kb-faq-hint">Extra two inputs if you want the bot to remember a specific FAQ.</p>
        {faqs.map((item) => (
          <div className="kb-faq-row" key={item.id}>
            <div>
              <b>{item.question || item.title}</b>
              <p>{item.answer}</p>
            </div>
            <button className="ap-btn ap-btn-sm ap-btn-danger" type="button" onClick={() => remove(item.id)} disabled={busy}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        <form className="kb-faq-form" onSubmit={addFaq}>
          <div className="ap-f-field">
            <label htmlFor="kbQuestion">Question</label>
            <input
              id="kbQuestion"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Where is the office?"
            />
          </div>
          <div className="ap-f-field">
            <label htmlFor="kbAnswer">Answer</label>
            <textarea
              id="kbAnswer"
              rows={3}
              value={a}
              onChange={(e) => setA(e.target.value)}
              placeholder="We are at…"
            />
          </div>
          <button className="ap-btn ap-btn-ghost" type="submit" disabled={busy}>
            <Plus size={14} /> Add question
          </button>
        </form>
      </div>
    </div>
  );
}
