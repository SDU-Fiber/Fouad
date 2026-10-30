import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, CheckSquare, Copy, Download, FileText, Film, Gavel, ListChecks, MessageSquare, Plus, Printer, RefreshCw, Sparkles, UserCheck } from 'lucide-react';
import { useApp, useMessages } from '../data/AppContext';
import { meetingStats } from '../data/selectors';
import { generateInsights } from '../ai/assistant';
import { isLeader } from '../lib/permissions';
import { navigate } from '../lib/router';
import type { ActionSuggestion } from '../lib/types';
import { cls, copyText, fmtBytes, fmtDate, fmtDue, fmtDuration, fmtTime, isOverdue } from '../lib/utils';
import { Avatar, Empty, PRIORITY_LABEL, PRIORITY_TONE, TASK_STATUS_LABEL, useAction, useToast } from './ui';
import { useMeetingActions } from './meetingActions';

function Recording({ meetingId }: { meetingId: string }) {
  const { db, backend } = useApp();
  const m = db.meetings.find((x) => x.id === meetingId)!;
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!m.recording) return;
    setLoading(true);
    backend.recordingUrl(m.recording).then(setUrl).finally(() => setLoading(false));
  }, [backend, m.recording]);
  if (!m.recording) return <p className="muted small">{m.recording_enabled ? 'Recording was enabled but nothing was recorded.' : 'This meeting was not recorded.'}</p>;
  return (
    <div className="col">
      {loading ? <div className="spinner sm" /> : url ? <video src={url} controls style={{ width: '100%', borderRadius: 12, background: '#000', maxHeight: 360 }} /> : <p className="muted small">Recording file is stored on the device that recorded it.</p>}
      <div className="row between small">
        <span className="muted">{m.recording.name} · {fmtBytes(m.recording.size)} · {fmtDuration(m.recording.duration_sec)}</span>
        {url && <a className="btn btn-outline btn-sm" href={url} download={m.recording.name}><Download size={14} /> Download</a>}
      </div>
    </div>
  );
}

export function MeetingReport({ meetingId, justEnded }: { meetingId: string; justEnded?: boolean }) {
  const { db, me, backend, userById } = useApp();
  const { createTask } = useMeetingActions();
  const run = useAction();
  const toast = useToast();
  const { messages: chat } = useMessages({ meeting_id: meetingId });
  const [generating, setGenerating] = useState(false);
  const autoRan = useRef(false);
  const m = db.meetings.find((x) => x.id === meetingId);
  const insights = db.meeting_insights.find((i) => i.meeting_id === meetingId);
  const leader = isLeader(me);

  const generate = async () => {
    setGenerating(true);
    await run(() => generateInsights(backend, db, meetingId, chat), 'AI summary ready');
    setGenerating(false);
  };

  useEffect(() => {
    if (justEnded && leader && m && !insights && !autoRan.current && m.status === 'ended') {
      autoRan.current = true;
      const t = setTimeout(() => void generate(), 900); // let final notes/attendance sync first
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justEnded, leader, m?.status, insights]);

  if (!m) return <div className="card"><Empty icon={<FileText size={22} />} title="Meeting not found">It may have been removed or you don't have access.</Empty></div>;

  const s = meetingStats(db, m);
  const room = db.team_rooms.find((r) => r.id === m.room_id);
  const taskTitles = new Set(s.tasks.map((t) => t.title.toLowerCase()));
  const suggestions = (insights?.action_items ?? []).filter((a) => a.source !== 'task' && !taskTitles.has(a.title.toLowerCase()));

  const addSuggestion = (a: ActionSuggestion) =>
    run(() => createTask({ title: a.title, assignee_id: a.assignee_id ?? me.id, priority: a.priority, due_date: a.due_date, team_id: m.team_id, room_id: m.room_id, description: `AI-suggested action from "${m.title}"` }, m.id), 'Task created');

  const copySummary = async () => {
    const lines = [
      `${m.title} — ${fmtDate(m.scheduled_at, { weekday: 'short', day: 'numeric', month: 'short' })}`,
      `Duration: ${fmtDuration(s.durationSec)} · Attendance: ${s.present}/${s.invited} · Tasks: ${s.tasks.length}`,
      insights?.summary ? `\nSummary: ${insights.summary}` : '',
      s.decisions.length ? `\nDecisions:\n${s.decisions.map((d) => `• ${d.content}`).join('\n')}` : '',
      s.tasks.length ? `\nAction items:\n${s.tasks.map((t) => `• ${t.title} — ${userById(t.assignee_id)?.full_name} (${PRIORITY_LABEL[t.priority]}, ${fmtDue(t.due_date)})`).join('\n')}` : '',
    ];
    toast((await copyText(lines.filter(Boolean).join('\n'))) ? 'Minutes copied to clipboard' : 'Copy failed', 'success');
  };

  const attendanceRows = [...s.attendance].sort((a, b) => ['present', 'late', 'absent'].indexOf(a.status) - ['present', 'late', 'absent'].indexOf(b.status));

  return (
    <div className="col gap-16">
      <div className="row between no-print">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/history')}><ArrowLeft size={15} /> Meeting history</button>
        <div className="row">
          <button className="btn btn-outline btn-sm" onClick={copySummary}><Copy size={14} /> Copy minutes</button>
          <button className="btn btn-outline btn-sm" onClick={() => window.print()}><Printer size={14} /> Export PDF</button>
        </div>
      </div>

      <div className="ended-hero">
        <div style={{ position: 'relative', zIndex: 1 }}>
          {justEnded && <div className="row strong" style={{ color: '#4ade80', marginBottom: 6 }}><CheckCircle2 size={18} /> Meeting completed.</div>}
          <h1 style={{ color: '#fff' }}>{m.title}</h1>
          <p style={{ color: 'rgba(255,255,255,.65)', marginTop: 4 }}>
            {fmtDate(m.scheduled_at, { weekday: 'long', day: 'numeric', month: 'long' })} · {fmtTime(m.started_at ?? m.scheduled_at)}–{fmtTime(m.ended_at)}
            {room ? ` · ${room.name}` : ''} · host {userById(m.host_id)?.full_name}
          </p>
        </div>
        <div className="ended-stats">
          <div className="ended-stat"><div className="v">{Math.round(s.durationSec / 60)} min</div><div className="l">Duration</div></div>
          <div className="ended-stat"><div className="v">{s.present}/{s.invited}</div><div className="l">Attendance{s.late ? ` · ${s.late} late` : ''}</div></div>
          <div className="ended-stat"><div className="v">{s.tasks.length}</div><div className="l">Tasks created</div></div>
          <div className="ended-stat"><div className="v">{s.decisions.length}</div><div className="l">Decisions</div></div>
        </div>
      </div>

      <div className="card ai-card">
        <div className="card-head">
          <span className="ai-tag"><Sparkles size={14} /> AI meeting assistant</span>
          {leader && (
            <button className="btn btn-ghost btn-sm no-print" onClick={generate} disabled={generating}>
              {generating ? <span className="spinner sm" /> : <RefreshCw size={14} />} {insights ? 'Regenerate' : 'Generate summary'}
            </button>
          )}
        </div>
        <div className="card-body">
          {!insights ? (
            <p className="muted">{generating ? 'Analysing notes, decisions, chat and attendance…' : 'No summary yet.'}</p>
          ) : (
            <div className="grid g-2" style={{ gap: 20 }}>
              <div className="col gap-12">
                <div><div className="label">Summary</div><p className="mt-4">{insights.summary}</p></div>
                <div>
                  <div className="label">Key decisions</div>
                  {insights.decisions.length ? <ul className="bullets mt-4">{insights.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul> : <p className="muted small mt-4">None detected.</p>}
                </div>
              </div>
              <div className="col gap-12">
                <div>
                  <div className="label">Follow-ups</div>
                  {insights.follow_ups.length ? <ul className="bullets mt-4">{insights.follow_ups.map((f, i) => <li key={i}>{f}</li>)}</ul> : <p className="muted small mt-4">Nothing outstanding.</p>}
                </div>
                {suggestions.length > 0 && (
                  <div>
                    <div className="label">Suggested action items</div>
                    <div className="list mt-4">
                      {suggestions.map((a, i) => (
                        <div key={i} className="list-item small">
                          <Sparkles size={14} className="faint" />
                          <span className="grow">{a.title} <span className="faint">→ {userById(a.assignee_id)?.full_name.split(' ')[0] ?? 'unassigned'}</span></span>
                          {leader && <button className="btn btn-soft btn-xs no-print" onClick={() => addSuggestion(a)}><Plus size={12} /> Create task</button>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {insights && <p className="faint xs mt-12">Generated by {insights.provider === 'mock' ? 'built-in assistant (mock — connect an AI provider for LLM summaries)' : insights.provider} · {fmtTime(insights.created_at)}</p>}
        </div>
      </div>

      <div className="grid g-2">
        <div className="card">
          <div className="card-head"><h3><FileText size={17} className="red" /> Meeting notes</h3><span className="faint small">{s.notes.length}</span></div>
          <div className="card-body">
            {s.notes.length === 0 ? <p className="muted small">No notes were taken.</p> : (
              <div className="list">
                {s.notes.map((n) => (
                  <div key={n.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                    <Avatar user={userById(n.author_id)} size="xs" />
                    <div className="grow small">{n.content}<div className="faint xs">{userById(n.author_id)?.full_name.split(' ')[0]} · {fmtTime(n.created_at)}</div></div>
                  </div>
                ))}
              </div>
            )}
            {m.agenda.length > 0 && (
              <>
                <div className="label mt-16">Agenda</div>
                <div className="agenda-list mt-8">
                  {m.agenda.map((a) => <div key={a.id} className={cls('agenda-item', a.done && 'done')}><CheckCircle2 size={15} className={a.done ? 'green' : 'faint'} /><span className="t grow small">{a.title}</span><span className="faint xs">{a.minutes}m</span></div>)}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3><Gavel size={17} className="red" /> Decisions</h3><span className="faint small">{s.decisions.length}</span></div>
          <div className="card-body">
            {s.decisions.length === 0 ? <p className="muted small">No decisions recorded.</p> : (
              <div className="col">
                {s.decisions.map((d, i) => <div key={d.id} className="note decision"><span className="small"><b className="amber">#{i + 1}</b> {d.content}</span></div>)}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3><ListChecks size={17} className="red" /> Action items</h3><span className="faint small">{s.tasks.filter((t) => t.status === 'completed').length}/{s.tasks.length} done</span></div>
        <div className="card-body">
          {s.tasks.length === 0 ? <p className="muted small">No action items were assigned in this meeting.</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Task</th><th>Assigned to</th><th>Priority</th><th>Deadline</th><th>Status</th></tr></thead>
                <tbody>
                  {s.tasks.map((t) => (
                    <tr key={t.id}>
                      <td className="strong">{t.title}</td>
                      <td><span className="row small"><Avatar user={userById(t.assignee_id)} size="xs" /> {userById(t.assignee_id)?.full_name}</span></td>
                      <td><span className={cls('badge', PRIORITY_TONE[t.priority])}>{PRIORITY_LABEL[t.priority]}</span></td>
                      <td className={cls('small', t.status !== 'completed' && isOverdue(t.due_date) && 'red')}>{fmtDue(t.due_date)}</td>
                      <td><span className={cls('status-btn', t.status)}>{TASK_STATUS_LABEL[t.status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="grid g-2">
        <div className="card">
          <div className="card-head"><h3><UserCheck size={17} className="red" /> Attendance</h3><span className="small"><span className="green">{s.present - s.late} present</span> · <span className="amber">{s.late} late</span> · <span className="red">{s.absent} absent</span></span></div>
          <div className="card-body">
            {attendanceRows.length === 0 ? <p className="muted small">Attendance is visible to managers and team leaders.</p> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Name</th><th>Status</th><th>Joined</th><th>Left</th><th className="r">Time</th></tr></thead>
                  <tbody>
                    {attendanceRows.map((a) => (
                      <tr key={a.id}>
                        <td><span className="row small strong"><Avatar user={userById(a.user_id)} size="xs" /> {userById(a.user_id)?.full_name}</span></td>
                        <td><span className={cls('badge', a.status === 'present' ? 'tone-green' : a.status === 'late' ? 'tone-amber' : 'tone-red')}>{a.status}</span></td>
                        <td className="small num">{fmtTime(a.joined_at)}</td>
                        <td className="small num">{fmtTime(a.left_at)}</td>
                        <td className="r small num">{a.total_seconds ? fmtDuration(a.total_seconds) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        <div className="col gap-16">
          <div className="card">
            <div className="card-head"><h3><Film size={17} className="red" /> Recording</h3></div>
            <div className="card-body"><Recording meetingId={m.id} /></div>
          </div>
          <div className="card">
            <div className="card-head"><h3><MessageSquare size={17} className="red" /> Meeting chat</h3><span className="faint small">{chat.length}</span></div>
            <div className="card-body" style={{ maxHeight: 280, overflowY: 'auto' }}>
              {chat.length === 0 ? <p className="muted small">No chat messages.</p> : chat.map((c) => (
                <div key={c.id} className="small" style={{ padding: '4px 0' }}><span className="faint xs num">{fmtTime(c.created_at)}</span> <b>{userById(c.sender_id)?.full_name.split(' ')[0]}:</b> {c.body}{c.attachments.length ? ` 📎 ${c.attachments.map((a) => a.name).join(', ')}` : ''}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {leader && <p className="faint xs center no-print"><CheckSquare size={12} /> Meet → Discuss → Decide → Assign → Track → Measure</p>}
    </div>
  );
}
