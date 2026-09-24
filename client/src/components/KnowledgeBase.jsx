import { useEffect, useRef, useState } from 'react';
import { BookOpen, FileText, Globe, HelpCircle, Plus, RotateCcw, Scale, Trash2, Upload } from 'lucide-react';
import api from '../api/client';

const DEFAULT_GREETING =
  'Welcome to Botho Innovations Visitor Management System. Please provide your details (Names, Company, Purpose, Visit date, Time).';
const DEFAULT_INSTRUCTION =
  'Always ask who they are visiting (host name or department). Notify only that saved host. Answer only from this knowledge base. Never invent services, staff, or prices.';

const TABS = [
  { id: 'voice', label: 'Voice', icon: BookOpen },
  { id: 'rules', label: 'Rules', icon: Scale },
  { id: 'files', label: 'Files', icon: FileText },
  { id: 'web', label: 'Website', icon: Globe },
  { id: 'faq', label: 'Q&A', icon: HelpCircle },
];

function ItemRow({ title, text, onRemove, busy }) {
  return (
    <div className="kb-item">
      <div>
        {title ? <b>{title}</b> : null}
        <p>{text}</p>
      </div>
      <button className="ap-btn ap-btn-danger ap-btn-sm" type="button" disabled={busy} onClick={onRemove} aria-label="Delete">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export default function KnowledgeBase({ onToast }) {
  const [tab, setTab] = useState('voice');
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
  const trained = rules.length + faqs.length + documents.length + websites.length;

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

  return (
    <div className="ap-panel kb-shell">
      <div className="ap-panel-head">
        <div className="ap-panel-title">
          <span className="ap-panel-ic">
            <BookOpen size={16} strokeWidth={2} />
          </span>
          <div>
            <h3>Company knowledge</h3>
            <p>Train the visitor agent with your voice, rules, files, and FAQs. It answers only from this library.</p>
          </div>
        </div>
        <span className="ap-badge active">{trained} sources</span>
      </div>

      <div className="kb-tabs" role="tablist">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={'kb-tab' + (tab === item.id ? ' active' : '')}
              onClick={() => setTab(item.id)}
            >
              <Icon size={15} />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === 'voice' ? (
        <div className="kb-pane">
          <div className="ap-f-field">
            <label htmlFor="kbGreeting">Welcome message</label>
            <textarea id="kbGreeting" rows={3} value={greeting} onChange={(e) => setGreeting(e.target.value)} />
          </div>
          <div className="kb-actions">
            <button className="ap-btn ap-btn-ghost ap-btn-sm" type="button" disabled={busy} onClick={() => { setGreeting(DEFAULT_GREETING); setInstruction(DEFAULT_INSTRUCTION); onToast?.('Default text restored. Save to apply.'); }}>
              <RotateCcw size={14} /> Reset
            </button>
            <button className="ap-btn ap-btn-teal ap-btn-sm" type="button" disabled={busy} onClick={() => saveKind('greeting', greeting, greetingRow)}>
              Save greeting
            </button>
          </div>
          <div className="ap-f-field">
            <label htmlFor="kbInstruction">Agent instructions</label>
            <textarea id="kbInstruction" rows={3} value={instruction} onChange={(e) => setInstruction(e.target.value)} />
          </div>
          <div className="kb-actions">
            <button className="ap-btn ap-btn-teal ap-btn-sm" type="button" disabled={busy} onClick={() => saveKind('instruction', instruction, instructionRow)}>
              Save instructions
            </button>
          </div>
        </div>
      ) : null}

      {tab === 'rules' ? (
        <div className="kb-pane">
          <div className="ap-f-field">
            <label htmlFor="kbRule">Business rule</label>
            <textarea id="kbRule" rows={3} value={rule} onChange={(e) => setRule(e.target.value)} placeholder="Office hours are 8am–5pm. Visitors must be approved before entry." />
          </div>
          <div className="kb-actions">
            <button className="ap-btn ap-btn-teal ap-btn-sm" type="button" disabled={busy} onClick={addRule}>
              <Plus size={14} /> Add rule
            </button>
          </div>
          <div className="kb-items">
            {rules.length ? (
              rules.map((item) => <ItemRow key={item.id} text={item.answer} busy={busy} onRemove={() => remove(item.id)} />)
            ) : (
              <p className="kb-empty">No rules yet. Add visiting hours, dress code, or what the agent must never say.</p>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'files' ? (
        <div className="kb-pane">
          <button
            type="button"
            className={'kb-drop' + (drag ? ' over' : '')}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); uploadFile(e.dataTransfer.files?.[0]); }}
            onClick={() => fileRef.current?.click()}
          >
            <span className="ap-panel-ic">
              <Upload size={16} />
            </span>
            <div>
              <b>Upload PDF, Word, or text</b>
              <p>Drop a file here or browse · max 8 MB</p>
            </div>
            <input ref={fileRef} type="file" hidden accept=".pdf,.doc,.docx,.txt,.md,application/pdf,text/plain" onChange={(e) => uploadFile(e.target.files?.[0])} />
          </button>
          <div className="ap-f-field">
            <label htmlFor="kbNote">Or paste service notes</label>
            <textarea id="kbNote" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Describe your services, products, or visitor process…" />
          </div>
          <div className="kb-actions">
            <button className="ap-btn ap-btn-teal ap-btn-sm" type="button" disabled={busy} onClick={addNote}>
              <Plus size={14} /> Save notes
            </button>
          </div>
          <div className="kb-items">
            {documents.length ? (
              documents.map((item) => (
                <ItemRow key={item.id} title={item.title || 'Document'} text={item.preview || item.answer} busy={busy} onRemove={() => remove(item.id)} />
              ))
            ) : (
              <p className="kb-empty">No documents yet. Upload a brochure or paste service text.</p>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'web' ? (
        <div className="kb-pane">
          <div className="ap-f-field">
            <label htmlFor="kbUrl">Website URL</label>
            <input id="kbUrl" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://bothoinnovations.com" />
          </div>
          <div className="kb-actions">
            <button className="ap-btn ap-btn-teal ap-btn-sm" type="button" disabled={busy} onClick={addWebsite}>
              Import page
            </button>
          </div>
          <div className="kb-items">
            {websites.length ? (
              websites.map((item) => (
                <ItemRow key={item.id} title={item.title || 'Website'} text={item.question} busy={busy} onRemove={() => remove(item.id)} />
              ))
            ) : (
              <p className="kb-empty">No websites yet. Import a public page about your services.</p>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'faq' ? (
        <div className="kb-pane">
          <div className="kb-faq-grid">
            <div className="ap-f-field">
              <label htmlFor="kbQ">Question</label>
              <input id="kbQ" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Where should visitors park?" />
            </div>
            <div className="ap-f-field">
              <label htmlFor="kbA">Answer</label>
              <textarea id="kbA" rows={2} value={a} onChange={(e) => setA(e.target.value)} placeholder="Visitor parking is at the basement." />
            </div>
          </div>
          <div className="kb-actions">
            <button className="ap-btn ap-btn-teal ap-btn-sm" type="button" disabled={busy} onClick={addFaq}>
              <Plus size={14} /> Add question
            </button>
          </div>
          <div className="kb-items">
            {faqs.length ? (
              faqs.map((item) => (
                <ItemRow key={item.id} title={item.question || item.title} text={item.answer} busy={busy} onRemove={() => remove(item.id)} />
              ))
            ) : (
              <p className="kb-empty">No questions yet. Add short facts the agent can quote exactly.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
