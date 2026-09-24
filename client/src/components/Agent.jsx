import { useEffect, useRef, useState } from 'react';
import { Bot, Send, Sparkles } from 'lucide-react';
import api from '../api/client';
import { useI18n } from '../i18n';

const SUGGESTIONS = ['Who is waiting for approval?', 'Approve the latest pending visit', 'Summarize recent WhatsApp conversations'];

export default function Agent({ onAfterAction }) {
  const { t, lang } = useI18n();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  async function send(text) {
    const content = String(text || '').trim();
    if (!content || busy) return;
    const next = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const history = next.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));
      const { data } = await api.post('/host/agent', { message: content, history, lang });
      setMessages([...next, { role: 'assistant', content: data.reply || t('Done.') }]);
      onAfterAction?.();
    } catch (err) {
      setMessages([...next, { role: 'assistant', content: err.response?.data?.error || t('The assistant could not reply. Please try again.') }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ap-panel agent-panel">
      <div className="ap-panel-head">
        <div className="ap-panel-title">
          <span className="ap-panel-ic">
            <Bot size={16} strokeWidth={2} />
          </span>
          <div>
            <h3>{t('Portal assistant')}</h3>
            <p>{t('Ask about visitors, or ask it to approve or reject a request')}</p>
          </div>
        </div>
      </div>
      <div className="agent-bubbles">
        <div className="agent-bubble in">
          <p>
            {t(
              'I can list pending requests, approve or reject them, and summarize WhatsApp conversations. Visitors on WhatsApp are handled by the booking assistant.'
            )}
          </p>
        </div>
        {messages.map((m, i) => (
          <div key={i} className={'agent-bubble ' + (m.role === 'user' ? 'out' : 'in')}>
            <p>{m.content}</p>
          </div>
        ))}
        {busy ? (
          <div className="agent-bubble in">
            <p>{t('Thinking…')}</p>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
      <div className="agent-suggest">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="agent-chip" onClick={() => send(t(s))} disabled={busy}>
            <Sparkles size={12} strokeWidth={2.2} />
            {t(s)}
          </button>
        ))}
      </div>
      <form
        className="agent-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t('Ask the assistant…')} disabled={busy} />
        <button className="ap-btn ap-btn-teal ap-btn-sm" type="submit" disabled={busy || !input.trim()}>
          <Send size={14} strokeWidth={2.2} />
          {t('Send')}
        </button>
      </form>
    </div>
  );
}
