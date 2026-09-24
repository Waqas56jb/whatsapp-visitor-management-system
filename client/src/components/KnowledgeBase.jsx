import { useEffect, useRef, useState } from 'react';
import { BookOpen, FileText, Globe, HelpCircle, Lock, Plus, Scale, Trash2, Upload } from 'lucide-react';
import api from '../api/client';
import { useI18n } from '../i18n';

// Must match the fixed welcome sent by the server (server/src/whatsapp/messages.js).
const WELCOME = {
  en: 'Welcome to Botho Innovations Visitor Management System. Please provide your details (Names, Company, Purpose, Visit date, Time).',
  tn: 'Re a go amogela mo Botho Innovations Visitor Management System. Tsweetswee re romelele dintlha tsa gago (Maina, Kompone, Maikaelelo, Letlha la ketelo, Nako).',
};
const DEFAULT_INSTRUCTION =
  'Answer only from this knowledge base. Never invent services, staff, or prices. Office hours are 8am–5pm.';

const TABS = [
  { id: 'voice', label: 'Welcome & instructions', icon: BookOpen },
  { id: 'rules', label: 'Rules', icon: Scale },
  { id: 'files', label: 'Files', icon: FileText },
  { id: 'web', label: 'Website', icon: Globe },
  { id: 'faq', label: 'Q&A', icon: HelpCircle },
];

function ItemRow({ title, text, onRemove, busy }) {
  const { t } = useI18n();
  return (
    <div className="kb-item">
      <div>
        {title ? <b>{title}</b> : null}
        <p>{text}</p>
      </div>
      <button className="ap-btn ap-btn-danger ap-btn-sm" type="button" disabled={busy} onClick={onRemove} aria-label={t('Delete')}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export default function KnowledgeBase({ onToast }) {
  const { t } = useI18n();
  const [tab, setTab] = useState('voice');
  const [items, setItems] = useState([]);
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION);
  const [rule, setRule] = useState('');
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const [a, setA] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);

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
    setInstruction(rows.find((i) => i.kind === 'instruction')?.answer || DEFAULT_INSTRUCTION);
  }

  useEffect(() => {
    load().catch(() => onToast?.(t('Could not load the knowledge base'), true));
  }, []);

  async function saveInstruction() {
    if (!instruction.trim()) {
      onToast?.(t('This field cannot be empty'), true);
      return;
    }
    setBusy(true);
    try {
      if (instructionRow) await api.patch(`/host/knowledge/${instructionRow.id}`, { kind: 'instruction', answer: instruction.trim() });
      else await api.post('/host/knowledge', { kind: 'instruction', title: 'instruction', answer: instruction.trim() });
      await load();
      onToast?.(t('Saved to the knowledge base'));
    } catch (err) {
      onToast?.(err.response?.data?.error || t('Could not save'), true);
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
      return true;
    } catch (err) {
      onToast?.(err.response?.data?.error || t('Could not save'), true);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addFaq() {
    if (!q.trim() || !a.trim()) {
      onToast?.(t('Add both a question and an answer'), true);
      return;
    }
    if (await addItem({ kind: 'qa', title: q.trim(), question: q.trim(), answer: a.trim() }, t('Question saved'))) {
      setQ('');
      setA('');
    }
  }

  async function addRule() {
    if (!rule.trim()) {
      onToast?.(t('Write a rule first'), true);
      return;
    }
    if (await addItem({ kind: 'rule', title: 'Business rule', answer: rule.trim() }, t('Rule saved'))) setRule('');
  }

  async function addNote() {
    if (!note.trim()) {
      onToast?.(t('Paste some text first'), true);
      return;
    }
    if (await addItem({ kind: 'text', title: 'Service notes', answer: note.trim() }, t('Notes saved'))) setNote('');
  }

  async function addWebsite() {
    if (!url.trim()) {
      onToast?.(t('Paste a website link'), true);
      return;
    }
    setBusy(true);
    try {
      await api.post('/host/knowledge/website', { url: url.trim() });
      setUrl('');
      await load();
      onToast?.(t('Website imported'));
    } catch (err) {
      onToast?.(err.response?.data?.error || t('Could not import that link'), true);
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
      onToast?.(t('{name} added to the knowledge base', { name: file.name }));
    } catch (err) {
      onToast?.(err.response?.data?.error || t('Could not read that file'), true);
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
      onToast?.(t('Could not delete'), true);
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
            <h3>{t('Company knowledge')}</h3>
            <p>
              {t(
                'Facts the WhatsApp assistant can use to answer visitor questions (hours, address, parking, rules). Bookings are always collected step by step.'
              )}
            </p>
          </div>
        </div>
        <span className="ap-badge active">{t('{count} sources', { count: trained })}</span>
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
              {t(item.label)}
            </button>
          );
        })}
      </div>

      {tab === 'voice' ? (
        <div className="kb-pane">
          <div className="kb-fixed">
            <div className="kb-fixed-head">
              <Lock size={14} />
              <b>{t('Official welcome message')}</b>
              <span>{t('Fixed — sent once when a visitor greets the company WhatsApp')}</span>
            </div>
            <div className="kb-fixed-row">
              <em>English</em>
              <p>{WELCOME.en}</p>
            </div>
            <div className="kb-fixed-row">
              <em>Setswana</em>
              <p>{WELCOME.tn}</p>
            </div>
          </div>
          <div className="ap-f-field">
            <label htmlFor="kbInstruction">{t('Assistant instructions')}</label>
            <textarea id="kbInstruction" rows={3} value={instruction} onChange={(e) => setInstruction(e.target.value)} />
          </div>
          <div className="kb-actions">
            <button className="ap-btn ap-btn-teal ap-btn-sm" type="button" disabled={busy} onClick={saveInstruction}>
              {t('Save instructions')}
            </button>
          </div>
        </div>
      ) : null}

      {tab === 'rules' ? (
        <div className="kb-pane">
          <div className="ap-f-field">
            <label htmlFor="kbRule">{t('Rule')}</label>
            <textarea
              id="kbRule"
              rows={3}
              value={rule}
              onChange={(e) => setRule(e.target.value)}
              placeholder={t('Office hours are 8am–5pm. Visitors must be approved before entry.')}
            />
          </div>
          <div className="kb-actions">
            <button className="ap-btn ap-btn-teal ap-btn-sm" type="button" disabled={busy} onClick={addRule}>
              <Plus size={14} /> {t('Add rule')}
            </button>
          </div>
          <div className="kb-items">
            {rules.length ? (
              rules.map((item) => <ItemRow key={item.id} text={item.answer} busy={busy} onRemove={() => remove(item.id)} />)
            ) : (
              <p className="kb-empty">{t('No rules yet. Add visiting hours, ID requirements, or dress code.')}</p>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'files' ? (
        <div className="kb-pane">
          <button
            type="button"
            className={'kb-drop' + (drag ? ' over' : '')}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              uploadFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => fileRef.current?.click()}
          >
            <span className="ap-panel-ic">
              <Upload size={16} />
            </span>
            <div>
              <b>{t('Upload PDF, Word, or text')}</b>
              <p>{t('Drop a file here or browse · max 8 MB')}</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept=".pdf,.doc,.docx,.txt,.md,application/pdf,text/plain"
              onChange={(e) => uploadFile(e.target.files?.[0])}
            />
          </button>
          <div className="ap-f-field">
            <label htmlFor="kbNote">{t('Or paste text')}</label>
            <textarea
              id="kbNote"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('Describe your services, directions, or visitor process…')}
            />
          </div>
          <div className="kb-actions">
            <button className="ap-btn ap-btn-teal ap-btn-sm" type="button" disabled={busy} onClick={addNote}>
              <Plus size={14} /> {t('Save text')}
            </button>
          </div>
          <div className="kb-items">
            {documents.length ? (
              documents.map((item) => (
                <ItemRow key={item.id} title={item.title || t('Document')} text={item.preview || item.answer} busy={busy} onRemove={() => remove(item.id)} />
              ))
            ) : (
              <p className="kb-empty">{t('No documents yet. Upload a brochure or paste text.')}</p>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'web' ? (
        <div className="kb-pane">
          <div className="ap-f-field">
            <label htmlFor="kbUrl">{t('Website link')}</label>
            <input id="kbUrl" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://bothoinnovations.com" />
          </div>
          <div className="kb-actions">
            <button className="ap-btn ap-btn-teal ap-btn-sm" type="button" disabled={busy} onClick={addWebsite}>
              {t('Import page')}
            </button>
          </div>
          <div className="kb-items">
            {websites.length ? (
              websites.map((item) => (
                <ItemRow key={item.id} title={item.title || t('Website')} text={item.question} busy={busy} onRemove={() => remove(item.id)} />
              ))
            ) : (
              <p className="kb-empty">{t('No websites yet. Import a public page about the company.')}</p>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'faq' ? (
        <div className="kb-pane">
          <div className="kb-faq-grid">
            <div className="ap-f-field">
              <label htmlFor="kbQ">{t('Question')}</label>
              <input id="kbQ" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Where should visitors park?')} />
            </div>
            <div className="ap-f-field">
              <label htmlFor="kbA">{t('Answer')}</label>
              <textarea id="kbA" rows={2} value={a} onChange={(e) => setA(e.target.value)} placeholder={t('Visitor parking is in the basement.')} />
            </div>
          </div>
          <div className="kb-actions">
            <button className="ap-btn ap-btn-teal ap-btn-sm" type="button" disabled={busy} onClick={addFaq}>
              <Plus size={14} /> {t('Add question')}
            </button>
          </div>
          <div className="kb-items">
            {faqs.length ? (
              faqs.map((item) => (
                <ItemRow key={item.id} title={item.question || item.title} text={item.answer} busy={busy} onRemove={() => remove(item.id)} />
              ))
            ) : (
              <p className="kb-empty">{t('No questions yet. Add short facts the assistant can quote.')}</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
