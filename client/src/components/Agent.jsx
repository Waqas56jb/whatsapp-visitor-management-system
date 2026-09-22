import { useEffect, useRef, useState } from 'react';
import { Bot, Send, Sparkles } from 'lucide-react';
import api from '../api/client';

const SUGGESTIONS = [
  'Who is waiting for my approval?',
  'Approve the latest pending visit',
  'Summarize my WhatsApp conversations',
];

export default function Agent({ onAfterAction }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'I am your dashboard assistant. I can list pending leads, approve or reject them, and summarize WhatsApp threads. Visitors who message your linked WhatsApp are handled by the trained agent in Knowledge base.',
    },
  ]);
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
      const history = next
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(0, -1)
        .map((m) => ({ role: m.role, content: m.content }));
      const { data } = await api.post('/host/agent', { message: content, history });
      setMessages([...next, { role: 'assistant', content: data.reply || 'Done.' }]);
      if (onAfterAction) onAfterAction();
    } catch (err) {
      setMessages([
        ...next,
        {
          role: 'assistant',
          content: err.response?.data?.error || 'The agent could not reply. Check OPENAI_API_KEY on the server.',
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    send(input);
  }

  return (
    <div className="ap-panel agent-panel">
      <div className="ap-panel-head">
        <div className="ap-panel-title">
          <span className="ap-panel-ic">
            <Bot size={16} strokeWidth={2} />
          </span>
          <div>
            <h3>Host AI agent</h3>
            <p>Ask about your visitors, or tell me to approve or reject a request</p>
          </div>
        </div>
      </div>
      <div className="agent-bubbles">
        {messages.map((m, i) => (
          <div key={i} className={'agent-bubble ' + (m.role === 'user' ? 'out' : 'in')}>
            <p>{m.content}</p>
          </div>
        ))}
        {busy ? (
          <div className="agent-bubble in">
            <p>Thinking…</p>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
      <div className="agent-suggest">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="agent-chip" onClick={() => send(s)} disabled={busy}>
            <Sparkles size={12} strokeWidth={2.2} />
            {s}
          </button>
        ))}
      </div>
      <form className="agent-form" onSubmit={onSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the agent…"
          disabled={busy}
        />
        <button className="ap-btn ap-btn-teal ap-btn-sm" type="submit" disabled={busy || !input.trim()}>
          <Send size={14} strokeWidth={2.2} />
          Send
        </button>
      </form>
    </div>
  );
}
