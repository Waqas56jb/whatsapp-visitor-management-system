import { useEffect, useState } from 'react';
import { ArrowLeft, MessagesSquare } from 'lucide-react';
import api from '../api/client';
import { useI18n } from '../i18n';

export default function Conversations() {
  const { t, formatDateTime: formatWhen } = useI18n();
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
      <div className={'chat-split' + (selected ? ' has-thread' : '')}>
        <aside className="chat-list">
          {loading ? (
            <p className="chat-empty">{t('Loading conversations…')}</p>
          ) : threads.length ? (
            threads.map((th) => (
              <button
                key={th.phone}
                className={'chat-thread-item' + (selected?.phone === th.phone ? ' active' : '')}
                onClick={() => openThread(th)}
              >
                <b>{th.visitorName || `+${th.phone}`}</b>
                <span className="chat-preview">{th.lastMessage || '—'}</span>
                <em>
                  {t('{count} messages', { count: th.messageCount })} · {formatWhen(th.lastAt)}
                </em>
              </button>
            ))
          ) : (
            <p className="chat-empty">{t('No WhatsApp conversations yet')}</p>
          )}
        </aside>
        <div className="chat-thread">
          {selected ? (
            <>
              <div className="chat-thread-head">
                <button className="chat-back" type="button" onClick={() => setSelected(null)} aria-label={t('Back to conversations')}>
                  <ArrowLeft size={16} />
                </button>
                <div>
                  <b>{selected.visitorName || `+${selected.phone}`}</b>
                  <span>+{selected.phone}</span>
                </div>
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
              <p>{t('Select a conversation to read it')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
