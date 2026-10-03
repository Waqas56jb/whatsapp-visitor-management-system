import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Headset, MessagesSquare, Send } from 'lucide-react';
import api, { errorText } from '../../api/client';
import { useI18n } from '../../i18n';
import { act, notify, Panel, SearchInput, matches, useApi } from '../../ui';

export default function ConversationsPage({ me }) {
  const { t, formatDateTime } = useI18n();
  const { data, reload } = useApi('/conversations', { initial: { threads: [], handovers: [] }, interval: 15000 });
  const [selected, setSelected] = useState(null);
  const [thread, setThread] = useState(null);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [sending, setSending] = useState(false);
  const bottom = useRef(null);
  const canReply = me.permissions.includes('conversations.reply');

  async function loadThread(phone, quiet = false) {
    try {
      const { data: d } = await api.get(`/conversations/${encodeURIComponent(phone)}`);
      setThread(d);
    } catch (err) {
      if (!quiet) notify.err(errorText(err, t('Could not load the conversation')));
    }
  }

  useEffect(() => {
    if (!selected) return undefined;
    loadThread(selected, false);
    const timer = setInterval(() => loadThread(selected, true), 8000);
    return () => clearInterval(timer);
  }, [selected]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [thread?.messages?.length]);

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    const ok = await act(() => api.post(`/conversations/${encodeURIComponent(selected)}/reply`, { text }), null, t('Could not send the message'));
    setSending(false);
    if (ok) {
      setText('');
      loadThread(selected, true);
    }
  }

  async function closeHandover() {
    if (await act(() => api.post(`/conversations/${encodeURIComponent(selected)}/close`), t('Handover closed — the assistant takes over again'), t('Could not close the handover'))) {
      loadThread(selected, true);
      reload();
    }
  }

  const handoverPhones = new Set((data?.handovers || []).map((h) => h.phone));
  const threads = (data?.threads || []).filter((th) => matches(query, th.visitorName, th.phone, th.lastMessage));
  const current = threads.find((th) => th.phone === selected) || (data?.threads || []).find((th) => th.phone === selected);

  return (
    <>
      {data?.handovers?.length ? (
        <div className="handover-strip">
          <Headset size={16} />
          <b>{t('{count} visitor(s) asked for a person', { count: data.handovers.length })}</b>
          {data.handovers.map((h) => (
            <button key={h.ref} className="tag tag-warning clickable" onClick={() => setSelected(h.phone)}>
              {h.department} · {h.ref}
            </button>
          ))}
        </div>
      ) : null}
      <Panel icon={MessagesSquare} title={t('WhatsApp conversations')} sub={t('Every message with visitors, newest first')} actions={<SearchInput value={query} onChange={setQuery} />}>
        <div className={'chat-split' + (selected ? ' has-thread' : '')}>
          <aside className="chat-list">
            {threads.length ? (
              threads.map((th) => (
                <button key={th.phone} className={'chat-thread-item' + (selected === th.phone ? ' active' : '')} onClick={() => setSelected(th.phone)}>
                  <b>
                    {th.visitorName || `+${th.phone}`} {handoverPhones.has(th.phone) ? <span className="flag-tag">{t('Waiting for staff')}</span> : null}
                  </b>
                  <span className="chat-preview">{th.lastMessage || '—'}</span>
                  <em>
                    {t('{count} messages', { count: th.messageCount })} · {formatDateTime(th.lastAt)}
                  </em>
                </button>
              ))
            ) : (
              <p className="chat-empty">{t('No WhatsApp conversations yet')}</p>
            )}
          </aside>
          <div className="chat-thread">
            {selected && thread ? (
              <>
                <div className="chat-thread-head">
                  <button className="chat-back" type="button" onClick={() => setSelected(null)} aria-label={t('Back to conversations')}>
                    <ArrowLeft size={16} />
                  </button>
                  <div>
                    <b>{current?.visitorName || `+${selected}`}</b>
                    <span>+{selected}</span>
                  </div>
                  {thread.handover ? (
                    <div className="chat-handover">
                      <span className="flag-tag">
                        {t('Handover')}: {thread.handover.department} · {thread.handover.ref}
                      </span>
                      {canReply ? (
                        <button className="btn btn-sm btn-ghost" onClick={closeHandover}>
                          {t('Close handover')}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="chat-bubbles">
                  {thread.messages.map((m) => (
                    <div key={m.id} className={'chat-bubble ' + (m.direction === 'outgoing' ? 'out' : 'in')}>
                      <p>{m.text}</p>
                      <time>{formatDateTime(m.createdAt)}</time>
                    </div>
                  ))}
                  <div ref={bottom} />
                </div>
                {canReply ? (
                  <div className="chat-compose">
                    <textarea
                      rows={2}
                      value={text}
                      placeholder={thread.handover ? t('Reply to the visitor on WhatsApp…') : t('Send a message to this visitor on WhatsApp…')}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          send();
                        }
                      }}
                    />
                    <button className="btn btn-violet" onClick={send} disabled={sending || !text.trim()}>
                      <Send size={15} /> {t('Send')}
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="chat-empty-panel">
                <MessagesSquare size={28} strokeWidth={1.7} />
                <p>{t('Select a conversation to read it')}</p>
              </div>
            )}
          </div>
        </div>
      </Panel>
    </>
  );
}
