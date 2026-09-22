import { useEffect, useState } from 'react';
import { MessagesSquare } from 'lucide-react';
import api from '../api/client';

function formatWhen(value) {
  if (!value) return '';
  return new Date(value).toLocaleString();
}

export default function Conversations() {
  const [threads, setThreads] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/host/conversations');
        if (!cancelled) setThreads(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setThreads([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function openThread(thread) {
    setSelected(thread);
    try {
      const { data } = await api.get(`/conversations/${encodeURIComponent(thread.phone)}`);
      setMessages(data.messages || []);
    } catch {
      setMessages([]);
    }
  }

  return (
    <div className="ap-panel">
      <div className="chat-split">
        <aside className="chat-list">
          {loading ? (
            <p className="chat-empty">Loading conversations…</p>
          ) : threads.length ? (
            threads.map((t) => (
              <button
                key={t.phone}
                className={'chat-thread-item' + (selected?.phone === t.phone ? ' active' : '')}
                onClick={() => openThread(t)}
              >
                <b>{t.visitorName || t.phone}</b>
                <span className="chat-preview">{t.lastMessage || '—'}</span>
                <em>
                  {t.messageCount} messages · {formatWhen(t.lastAt)}
                </em>
              </button>
            ))
          ) : (
            <p className="chat-empty">No conversations for your visits yet</p>
          )}
        </aside>
        <div className="chat-thread">
          {selected ? (
            <>
              <div className="chat-thread-head">
                <b>{selected.visitorName || selected.phone}</b>
                <span>{selected.phone}</span>
              </div>
              <div className="chat-bubbles">
                {messages.map((m) => (
                  <div key={m.id} className={'chat-bubble ' + (m.direction === 'outgoing' ? 'out' : 'in')}>
                    <p>{m.text}</p>
                    <time>{formatWhen(m.createdAt)}</time>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="chat-empty-panel">
              <MessagesSquare size={28} strokeWidth={1.7} />
              <p>Select a conversation to read the thread</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
