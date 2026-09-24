import { useEffect, useRef, useState } from 'react';
import { BookOpen, FileUp, Globe, Plus, RotateCcw, Scale, Trash2, Upload } from 'lucide-react';
import api from '../api/client';

const DEFAULT_GREETING =
  'Welcome to Botho Innovations Visitor Management System. Please provide your details (Names, Company, Purpose, Visit date, Time).';
const DEFAULT_INSTRUCTION =
  'Always ask who they are visiting (host name or department). Notify only that saved host. Answer only from this knowledge base. Never invent services, staff, or prices.';

export default function KnowledgeBase({ onToast }) {
  const [items, setItems] = useState([]);
  const [greeting, setGreeting] = useState(DEFAULT_GREETING);
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION);
  const [rule, setRule] = useState('');
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const [a, setA] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);

  const greetingRow = items.find((i) => i.kind === 'greeting');
  const instructionRow = items.find((i) => i.kind === 'instruction');
  const rules = items.filter((i) => i.kind === 'rule');
  const faqs = items.filter((i) => i.kind === 'qa');
  const documents = items.filter((i) => i.kind === 'document' || i.kind === 'text');
  const websites = items.filter((i) => i.kind === 'website');

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

  async function saveKind(kind, answer, existing, extras = {}) {
    if (!String(answer || '').trim()) {
      onToast?.('This field cannot be empty', true);
      return;
    }
    setBusy(true);
    try {
      if (existing) await api.patch(`/host/knowledge/${existing.id}`, { kind, answer: answer.trim(), ...extras });
      else await api.post('/host/knowledge', { kind, title: extras.title || kind, answer: answer.trim(), ...extras });
      await load();
      onToast?.('Saved to the company knowledge base');
    } catch (err) {
      onToast?.(err.response?.data?.error || 'Could not save', true);
    } finally {
      setBusy(false);
    }
  }

  async function addItem(payload, success) {
    setBusy(true);
    try {
      await api.post('/host/knowledge', payload);
      await load();
      onToast?.(success);
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
    await addItem({ kind: 'qa', title: q.trim(), question: q.trim(), answer: a.trim() }, 'Question saved');
    setQ('');
    setA('');
  }

  async function addRule() {
    if (!rule.trim()) {
      onToast?.('Write a business rule first', true);
      return;
    }
    await addItem({ kind: 'rule', title: 'Business rule', answer: rule.trim() }, 'Rule saved');
    setRule('');
  }

  async function addNote() {
    if (!note.trim()) {
      onToast?.('Paste the service text first', true);
      return;
    }
    await addItem({ kind: 'text', title: 'Service notes', answer: note.trim() }, 'Text saved');
    setNote('');
  }

  async function addWebsite() {
    if (!url.trim()) {
      onToast?.('Paste a website link', true);
      return;
    }
    setBusy(true);
    try {
      await api.post('/host/knowledge/website', { url: url.trim() });
      setUrl('');
      await load();
      onToast?.('Website imported into the knowledge base');
    } catch (err) {
      onToast?.(err.response?.data?.error || 'Could not import that link', true);
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(file) {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    setBusy(true);
    try {
      await api.post('/host/knowledge/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      await load();
      onToast?.(`${file.name} stored in the knowledge base`);
    } catch (err) {
      onToast?.(err.response?.data?.error || 'Could not read that file', true);
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

  function onDrop(e) {
    e.preventDefault();
    setDrag(false);
    uploadFile(e.dataTransfer.files?.[0]);
  }

  return (
    <div className="kb-page">
      <div className="kb-hero">
        <div>
          <span className="dash-kicker">
            <BookOpen size={14} /> Company knowledge
          </span>
          <h3>Train the Botho visitor agent</h3>
          <p>Upload documents, paste service text, add website links and business rules. The WhatsApp agent answers only from this library — it will not invent facts.</p>
        </div>
        <button className="ap-btn ap-btn-ghost ap-btn-sm" type="button" disabled={busy} onClick={() => { setGreeting(DEFAULT_GREETING); setInstruction(DEFAULT_INSTRUCTION); onToast?.('Default text restored in the form. Save to apply.'); }}>
          <RotateCcw size={14} /> Reset greeting
        </button>
      </div>

      <div className="kb-grid">
        <section className="kb-card">
          <header>
            <BookOpen size={18} />
            <div>
              <h4>Welcome &amp; voice</h4>
              <p>First message and how the agent should behave</p>
            </div>
          </header>
          <label>Welcome message</label>
          <textarea rows={3} value={greeting} onChange={(e) => setGreeting(e.target.value)} />
          <button className="ap-btn ap-btn-teal ap-btn-sm" disabled={busy} onClick={() => saveKind('greeting', greeting, greetingRow)}>
            Save greeting
          </button>
          <label>Agent instructions</label>
          <textarea rows={3} value={instruction} onChange={(e) => setInstruction(e.target.value)} />
          <button className="ap-btn ap-btn-ghost ap-btn-sm" disabled={busy} onClick={() => saveKind('instruction', instruction, instructionRow)}>
            Save instructions
          </button>
        </section>

        <section className="kb-card">
          <header>
            <Scale size={18} />
            <div>
              <h4>Business rules</h4>
              <p>Hours, visitor policy, what the agent must never say</p>
            </div>
          </header>
          <textarea rows={4} value={rule} onChange={(e) => setRule(e.target.value)} placeholder="Office hours are 8am–5pm. Visitors must be approved before entry." />
          <button className="ap-btn ap-btn-teal ap-btn-sm" disabled={busy} onClick={addRule}>
            <Plus size={14} /> Save rule
          </button>
          <div className="kb-list">
            {rules.map((item) => (
              <article key={item.id}>
                <p>{item.answer}</p>
                <button type="button" onClick={() => remove(item.id)} disabled={busy} aria-label="Delete rule">
                  <Trash2 size={14} />
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="kb-card kb-card-wide">
          <header>
            <FileUp size={18} />
            <div>
              <h4>Documents &amp; service notes</h4>
              <p>PDF, Word, or text — stored in the database and used for answers</p>
            </div>
          </header>
          <div
            className={'kb-drop' + (drag ? ' over' : '')}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={22} />
            <b>Drop a PDF, Word, or text file</b>
            <span>or click to browse · max 8 MB</span>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept=".pdf,.doc,.docx,.txt,.md,application/pdf,text/plain"
              onChange={(e) => uploadFile(e.target.files?.[0])}
            />
          </div>
          <label>Or paste service text</label>
          <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Describe your services, products, or visitor process…" />
          <button className="ap-btn ap-btn-teal ap-btn-sm" disabled={busy} onClick={addNote}>
            <Plus size={14} /> Save text
          </button>
          <div className="kb-list">
            {documents.map((item) => (
              <article key={item.id}>
                <div>
                  <b>{item.title || 'Document'}</b>
                  <p>{item.preview || item.answer}</p>
                </div>
                <button type="button" onClick={() => remove(item.id)} disabled={busy} aria-label="Delete document">
                  <Trash2 size={14} />
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="kb-card">
          <header>
            <Globe size={18} />
            <div>
              <h4>Website link</h4>
              <p>Import a public page so the agent can talk about your services</p>
            </div>
          </header>
          <div className="kb-inline">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://bothoinnovations.com" />
            <button className="ap-btn ap-btn-teal ap-btn-sm" disabled={busy} onClick={addWebsite}>
              Import
            </button>
          </div>
          <div className="kb-list">
            {websites.map((item) => (
              <article key={item.id}>
                <div>
                  <b>{item.title || 'Website'}</b>
                  <p>{item.question}</p>
                </div>
                <button type="button" onClick={() => remove(item.id)} disabled={busy} aria-label="Delete website">
                  <Trash2 size={14} />
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="kb-card">
          <header>
            <BookOpen size={18} />
            <div>
              <h4>Questions &amp; answers</h4>
              <p>Short facts the agent can quote exactly</p>
            </div>
          </header>
          <label>Question</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Where should visitors park?" />
          <label>Answer</label>
          <textarea rows={2} value={a} onChange={(e) => setA(e.target.value)} placeholder="Visitor parking is at the basement." />
          <button className="ap-btn ap-btn-teal ap-btn-sm" disabled={busy} onClick={addFaq}>
            <Plus size={14} /> Add question
          </button>
          <div className="kb-list">
            {faqs.map((item) => (
              <article key={item.id}>
                <div>
                  <b>{item.question || item.title}</b>
                  <p>{item.answer}</p>
                </div>
                <button type="button" onClick={() => remove(item.id)} disabled={busy} aria-label="Delete question">
                  <Trash2 size={14} />
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
