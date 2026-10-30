import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CornerUpLeft, FileText, Paperclip, Send, Smile, X } from 'lucide-react';
import { useApp, useMessages } from '../data/AppContext';
import type { MessageScope } from '../data/backend';
import type { Attachment, Message } from '../lib/types';
import { cls, fmtBytes, fmtDay, fmtTime, uid } from '../lib/utils';
import { Menu, UserAvatar, useAction, Empty } from './ui';
import { MessagesSquare } from 'lucide-react';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🙏', '🔥', '👏', '✅'];
const EMOJI = ['😀', '😂', '😊', '😍', '🤝', '👍', '👏', '🙏', '💪', '🔥', '🎉', '🚀', '✅', '❌', '⚠️', '📞', '📈', '📉', '💰', '🎯', '⭐', '❤️', '🤔', '👀'];

interface Props {
  scope: MessageScope;
  /** Extra filter (used for direct-message threads). */
  filter?: (m: Message) => boolean;
  /** Fields merged into every sent message (room_id / meeting_id / recipient_id). */
  target: Partial<Message>;
  placeholder?: string;
  compact?: boolean;
}

export function Chat({ scope, filter, target, placeholder = 'Write a message…', compact }: Props) {
  const { backend, me, userById } = useApp();
  const run = useAction();
  const { messages: all, loading } = useMessages(scope);
  const messages = useMemo(() => (filter ? all.filter(filter) : all), [all, filter]);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [uploading, setUploading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    stick.current = true;
  }, [JSON.stringify(scope)]);

  const send = async (attachments: Attachment[] = []) => {
    const body = text.trim();
    if (!body && !attachments.length) return;
    setText('');
    const reply = replyTo;
    setReplyTo(null);
    stick.current = true;
    await run(() => backend.insert('messages', { ...target, body, attachments, reply_to_id: reply?.id ?? null, sender_id: me.id }));
  };

  const attach = async (file: File) => {
    setUploading(true);
    const url = await run(() => backend.uploadFile('attachments', `${me.id}/${uid()}-${file.name}`, file));
    setUploading(false);
    if (url) await send([{ name: file.name, size: file.size, type: file.type, url }]);
  };

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  return (
    <div className="chat">
      <div className="chat-list" ref={listRef} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
        {loading ? <div className="row" style={{ justifyContent: 'center', padding: 24 }}><div className="spinner sm" /></div> : messages.length === 0 && (
          <Empty icon={<MessagesSquare size={20} />} title="No messages yet">Start the conversation.</Empty>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || fmtDay(prev.created_at) !== fmtDay(m.created_at);
          const grouped = !newDay && prev && prev.sender_id === m.sender_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000 && !m.reply_to_id;
          const sender = userById(m.sender_id);
          const reply = m.reply_to_id ? byId.get(m.reply_to_id) : null;
          return (
            <div key={m.id}>
              {newDay && <div className="day-sep">{fmtDay(m.created_at)}</div>}
              <div className={cls('msg', grouped && 'msg-grouped')}>
                {!grouped && <UserAvatar id={m.sender_id} size={compact ? 'sm' : undefined} />}
                <div className="grow" style={{ minWidth: 0 }}>
                  {!grouped && (
                    <div className="msg-head">
                      <span className="msg-name">{sender?.full_name ?? 'Unknown'}{m.sender_id === me.id && <span className="faint xs"> (you)</span>}</span>
                      <span className="msg-time">{fmtTime(m.created_at)}</span>
                    </div>
                  )}
                  {reply && <div className="msg-reply"><b>{userById(reply.sender_id)?.full_name.split(' ')[0]}</b>: {reply.body.slice(0, 90) || 'Attachment'}</div>}
                  {m.body && <div className="msg-body">{m.body}</div>}
                  {m.attachments.map((a, j) =>
                    a.type.startsWith('image/') ? (
                      <a key={j} href={a.url} target="_blank" rel="noreferrer" download={a.name}><img className="attach-img" src={a.url} alt={a.name} /></a>
                    ) : (
                      <a key={j} className="attach" href={a.url} target="_blank" rel="noreferrer" download={a.name}>
                        <FileText size={18} className="red" />
                        <span className="grow truncate small strong">{a.name}</span>
                        <span className="faint xs">{fmtBytes(a.size)}</span>
                      </a>
                    ),
                  )}
                  {Object.keys(m.reactions).length > 0 && (
                    <div className="reactions">
                      {Object.entries(m.reactions).map(([emoji, users]) => (
                        <button key={emoji} className={cls('reaction', users.includes(me.id) && 'mine')} title={users.map((u) => userById(u)?.full_name).join(', ')} onClick={() => run(() => backend.rpc('toggle_reaction', { message_id: m.id, emoji }))}>
                          {emoji} <span className="num">{users.length}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="msg-actions">
                  {QUICK_REACTIONS.slice(0, compact ? 3 : 5).map((e) => (
                    <button key={e} title="React" onClick={() => run(() => backend.rpc('toggle_reaction', { message_id: m.id, emoji: e }))}>{e}</button>
                  ))}
                  <button title="Reply" onClick={() => { setReplyTo(m); inputRef.current?.focus(); }}><CornerUpLeft size={15} /></button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="composer">
        {replyTo && (
          <div className="composer-reply">
            <span className="truncate"><CornerUpLeft size={12} /> Replying to <b>{userById(replyTo.sender_id)?.full_name}</b>: {replyTo.body.slice(0, 60)}</span>
            <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => setReplyTo(null)}><X size={14} /></button>
          </div>
        )}
        <div className="composer-box">
          <input ref={fileRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void attach(f); e.target.value = ''; }} />
          <button className="icon-btn" style={{ width: 32, height: 32 }} title="Attach file" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <span className="spinner sm" /> : <Paperclip size={17} />}
          </button>
          <Menu direction="up" align="left" trigger={(_, t) => <button className="icon-btn" style={{ width: 32, height: 32 }} title="Emoji" onClick={t}><Smile size={17} /></button>}>
            {(close) => (
              <div className="emoji-pop">
                {EMOJI.map((e) => <button key={e} onClick={() => { setText((t) => t + e); close(); inputRef.current?.focus(); }}>{e}</button>)}
              </div>
            )}
          </Menu>
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            placeholder={placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button className="btn btn-primary btn-icon btn-sm" onClick={() => send()} disabled={!text.trim()} aria-label="Send"><Send size={16} /></button>
        </div>
      </div>
    </div>
  );
}
