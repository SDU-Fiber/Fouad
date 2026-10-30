import { useState } from 'react';
import { CheckSquare, LayoutGrid, List, Pencil, Plus, Search, Trash2, Video } from 'lucide-react';
import { useApp } from '../data/AppContext';
import { can, isLeader } from '../lib/permissions';
import { navigate } from '../lib/router';
import type { Priority, Task, TaskStatus } from '../lib/types';
import { cls, fmtDate, fmtDue, isOverdue, sortBy } from '../lib/utils';
import { TaskFormModal } from '../components/forms';
import { Avatar, Empty, Menu, PRIORITY_LABEL, PRIORITY_TONE, Seg, TASK_STATUS_LABEL, useAction } from '../components/ui';

const COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'completed'];
const PRIO_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

function TaskCard({ task, onEdit }: { task: Task; onEdit: () => void }) {
  const { db, me, backend, userById } = useApp();
  const run = useAction();
  const assignee = userById(task.assignee_id);
  const creator = userById(task.created_by);
  const meetingLink = db.meeting_tasks.find((mt) => mt.task_id === task.id);
  const meeting = meetingLink && db.meetings.find((m) => m.id === meetingLink.meeting_id);
  const canEdit = task.created_by === me.id || isLeader(me);
  const overdue = task.status !== 'completed' && isOverdue(task.due_date);

  return (
    <div className={cls('task-card', task.status === 'completed' && 'done')} draggable onDragStart={(e) => e.dataTransfer.setData('text/task', task.id)}>
      <div className="row-top between">
        <span className="task-title">{task.title}</span>
        {canEdit && (
          <Menu trigger={(_, t) => <button className="icon-btn" style={{ width: 26, height: 26, marginTop: -3 }} onClick={t} aria-label="Task actions">⋯</button>}>
            {(close) => (
              <>
                <button className="menu-item" onClick={() => { close(); onEdit(); }}><Pencil size={14} /> Edit</button>
                <button className="menu-item danger" onClick={() => { close(); if (confirm('Delete this task?')) void run(() => backend.remove('tasks', task.id), 'Task deleted'); }}><Trash2 size={14} /> Delete</button>
              </>
            )}
          </Menu>
        )}
      </div>
      {task.description && <p className="small muted" style={{ marginTop: -4 }}>{task.description}</p>}
      <div className="row wrap gap-4">
        <span className={cls('badge', PRIORITY_TONE[task.priority])}><span className={`prio prio-${task.priority}`} /> {PRIORITY_LABEL[task.priority]}</span>
        <span className={cls('badge', overdue ? 'tone-red' : 'tone-gray')}>{task.status === 'completed' ? `Done${task.completed_at ? ' ' + fmtDate(task.completed_at) : ''}` : fmtDue(task.due_date)}</span>
        {meeting && <button className="badge tone-purple" style={{ border: 0 }} onClick={() => navigate(`/history/${meeting.id}`)}><Video size={11} /> {meeting.title}</button>}
      </div>
      <div className="row between">
        <span className="row small"><Avatar user={assignee} size="xs" /> <span className="truncate">{assignee?.full_name ?? 'Unassigned'}</span></span>
        <select
          className={cls('status-btn', task.status)}
          value={task.status}
          onChange={(e) => run(() => backend.update('tasks', task.id, { status: e.target.value as TaskStatus }))}
          aria-label="Status"
        >
          {COLUMNS.map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      <div className="faint xs">By {creator?.full_name.split(' ')[0] ?? '—'} · {fmtDate(task.created_at)}</div>
    </div>
  );
}

export function TasksPage() {
  const { db, me, backend } = useApp();
  const run = useAction();
  const [view, setView] = useState<'board' | 'list'>(window.innerWidth < 900 ? 'list' : 'board');
  const [scope, setScope] = useState<'mine' | 'all'>(isLeader(me) ? 'all' : 'mine');
  const [assignee, setAssignee] = useState('all');
  const [priority, setPriority] = useState<'all' | Priority>('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Task | 'new' | null>(null);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);

  // RLS already limits rows: employees only receive their own tasks.
  const tasks = sortBy(
    db.tasks
      .filter((t) => scope === 'all' || t.assignee_id === me.id)
      .filter((t) => assignee === 'all' || t.assignee_id === assignee)
      .filter((t) => priority === 'all' || t.priority === priority)
      .filter((t) => !q || t.title.toLowerCase().includes(q.toLowerCase())),
    (t) => `${PRIO_RANK[t.priority]}${t.due_date ?? '9999'}`,
  );
  const assignees = [...new Set(db.tasks.map((t) => t.assignee_id))].map((id) => db.users.find((u) => u.id === id)).filter(Boolean);

  const drop = (status: TaskStatus) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData('text/task');
    const t = db.tasks.find((x) => x.id === id);
    if (t && t.status !== status) void run(() => backend.update('tasks', id, { status }));
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tasks</h1>
          <p>{isLeader(me) ? 'All tasks for the people you manage.' : 'Tasks assigned to you.'}</p>
        </div>
        {can(me, 'task.create') && <button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={16} /> New task</button>}
      </div>
      <div className="row wrap gap-12" style={{ marginBottom: 16 }}>
        <div className="input-icon" style={{ width: 'min(240px, 100%)' }}>
          <Search size={16} />
          <input className="input" placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {isLeader(me) && <Seg value={scope} onChange={setScope} items={[{ key: 'all', label: 'Team' }, { key: 'mine', label: 'Mine' }]} />}
        {isLeader(me) && scope === 'all' && (
          <select className="select" style={{ width: 'auto' }} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="all">Everyone</option>
            {assignees.map((u) => <option key={u!.id} value={u!.id}>{u!.full_name}</option>)}
          </select>
        )}
        <select className="select" style={{ width: 'auto' }} value={priority} onChange={(e) => setPriority(e.target.value as Priority | 'all')}>
          <option value="all">Any priority</option>
          {(['urgent', 'high', 'medium', 'low'] as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
        </select>
        <div className="grow" />
        <Seg value={view} onChange={setView} items={[{ key: 'board', label: <><LayoutGrid size={14} /> Board</> }, { key: 'list', label: <><List size={14} /> List</> }]} />
      </div>

      {tasks.length === 0 ? (
        <div className="card"><Empty icon={<CheckSquare size={22} />} title="No tasks found">Tasks created in meetings and rooms appear here.</Empty></div>
      ) : view === 'board' ? (
        <div className="board">
          {COLUMNS.map((s) => {
            const items = tasks.filter((t) => t.status === s);
            return (
              <div key={s} className={cls('board-col', dragOver === s && 'drop')} onDragOver={(e) => { e.preventDefault(); setDragOver(s); }} onDragLeave={() => setDragOver(null)} onDrop={drop(s)}>
                <div className="board-col-head">
                  <span className="row"><span className={cls('status-btn', s)} style={{ height: 22 }}>{TASK_STATUS_LABEL[s]}</span></span>
                  <span className="faint small">{items.length}</span>
                </div>
                {items.map((t) => <TaskCard key={t.id} task={t} onEdit={() => setEditing(t)} />)}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="col">
          {COLUMNS.map((s) => {
            const items = tasks.filter((t) => t.status === s);
            if (!items.length) return null;
            return (
              <div key={s} className="col">
                <div className="row strong mt-8">{TASK_STATUS_LABEL[s]} <span className="faint small">{items.length}</span></div>
                {items.map((t) => <TaskCard key={t.id} task={t} onEdit={() => setEditing(t)} />)}
              </div>
            );
          })}
        </div>
      )}
      {editing && <TaskFormModal onClose={() => setEditing(null)} task={editing === 'new' ? undefined : editing} />}
    </>
  );
}
