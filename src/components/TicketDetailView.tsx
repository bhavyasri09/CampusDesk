import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Lock, RotateCcw, Send } from 'lucide-react';
import { apiFetch, formatExactDate, formatSlaRemaining } from '../lib/api';
import type {
  AuditLog,
  Department,
  Ticket,
  TicketComment,
  TicketPriority,
  TicketStatus,
  User,
} from '../types';
import { PriorityLabel, ROLE_LABELS, STATUS_LABELS, StatusLabel } from './StatusAndPriority';

interface TicketDetailViewProps {
  ticketId: number;
  currentUser: User;
  departments: Department[];
  staffUsers: User[];
  onBack: () => void;
  onTicketUpdated: () => void;
}

const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ['in_progress', 'waiting_on_student', 'resolved', 'closed'],
  in_progress: ['waiting_on_student', 'resolved', 'open', 'closed'],
  waiting_on_student: ['in_progress', 'resolved', 'closed', 'open'],
  resolved: ['closed', 'open'],
  closed: ['open'],
};

function describeAuditEntry(log: AuditLog): string {
  switch (log.action) {
    case 'ticket_created_auto_routed':
      return 'Ticket submitted and auto-routed';
    case 'ticket_created':
      return 'Ticket submitted';
    case 'status_changed':
      return `Status: ${STATUS_LABELS[(log.old_value ?? 'open') as TicketStatus] ?? log.old_value} → ${
        STATUS_LABELS[(log.new_value ?? 'open') as TicketStatus] ?? log.new_value
      }`;
    case 'priority_changed':
      return `Priority: ${log.old_value} → ${log.new_value}`;
    case 'assignee_changed':
      return `Assignee: ${log.old_value} → ${log.new_value}`;
    case 'department_changed':
      return `Department: ${log.old_value} → ${log.new_value}`;
    default:
      return log.action;
  }
}

export function TicketDetailView({
  ticketId,
  currentUser,
  departments,
  staffUsers,
  onBack,
  onTicketUpdated,
}: TicketDetailViewProps) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [replyBody, setReplyBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [postingReply, setPostingReply] = useState(false);
  const [updatingMeta, setUpdatingMeta] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{
        ticket: Ticket;
        comments: TicketComment[];
        audit_logs: AuditLog[];
      }>(`/tickets/${ticketId}`);
      setTicket(data.ticket);
      setComments(data.comments);
      setAuditLogs(data.audit_logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load ticket');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  async function patchTicket(payload: Record<string, unknown>) {
    if (!ticket) return;
    setUpdatingMeta(true);
    setActionError(null);
    try {
      const data = await apiFetch<{
        ticket: Ticket;
        comments: TicketComment[];
        audit_logs: AuditLog[];
      }>(`/tickets/${ticket.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setTicket(data.ticket);
      setComments(data.comments);
      setAuditLogs(data.audit_logs);
      onTicketUpdated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update ticket');
    } finally {
      setUpdatingMeta(false);
    }
  }

  async function handlePostComment(e: React.FormEvent) {
    e.preventDefault();
    if (!ticket || !replyBody.trim()) return;
    setPostingReply(true);
    setActionError(null);
    try {
      const res = await apiFetch<{ comment: TicketComment }>(
        `/tickets/${ticket.id}/comments`,
        {
          method: 'POST',
          body: JSON.stringify({
            body: replyBody.trim(),
            is_internal: currentUser.role === 'student' ? false : isInternal,
          }),
        }
      );
      setComments((prev) => [...prev, res.comment]);
      setReplyBody('');
      onTicketUpdated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to post reply');
    } finally {
      setPostingReply(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 h-96 bg-white border border-slate-200 rounded-lg animate-pulse" />
          <div className="lg:col-span-4 h-96 bg-white border border-slate-200 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <p className="text-sm font-medium text-red-700">{error ?? 'Ticket not found'}</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back to ticket queue</span>
        </button>
      </div>
    );
  }

  const sla = formatSlaRemaining(ticket.sla_due_at, ticket.status);
  const canEditStaffFields = currentUser.role === 'staff' || currentUser.role === 'admin';
  const availableNextStatuses = ALLOWED_TRANSITIONS[ticket.status];
  const assignableStaff = staffUsers.filter(
    (u) =>
      u.role === 'admin' ||
      u.department_id === ticket.department_id ||
      u.id === ticket.assigned_to_id
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer whitespace-nowrap"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Back to Tickets</span>
        </button>

        {currentUser.role === 'student' && ticket.status === 'resolved' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={updatingMeta}
              onClick={() => void patchTicket({ status: 'open' })}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Reopen Issue</span>
            </button>
            <button
              type="button"
              disabled={updatingMeta}
              onClick={() => void patchTicket({ status: 'closed' })}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors cursor-pointer whitespace-nowrap"
            >
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Confirm &amp; Close</span>
            </button>
          </div>
        )}
      </div>

      {actionError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700"
        >
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-6">
          <section className="bg-white border border-slate-200 rounded-lg p-6">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-mono font-semibold text-slate-700 tabular-nums">
                {ticket.ticket_code}
              </span>
              <span aria-hidden="true">·</span>
              <span>{ticket.department_name}</span>
              {ticket.location && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{ticket.location}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">Opened {formatExactDate(ticket.created_at)}</span>
            </div>

            <h1
              className="mt-2.5 font-display text-xl font-semibold text-slate-900 leading-snug"
              style={{ textWrap: 'balance' }}
            >
              {ticket.title}
            </h1>

            <p className="mt-4 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
              {ticket.description}
            </p>

            <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-4 text-xs text-slate-500">
              <span>
                Submitted by <strong className="font-medium text-slate-800">{ticket.student_name}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{ticket.student_email}</span>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-lg">
            <div className="px-6 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Discussion Thread
              </h2>
              <span className="text-xs text-slate-500 tabular-nums">
                {comments.length} {comments.length === 1 ? 'message' : 'messages'}
              </span>
            </div>

            {comments.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-slate-500">
                No replies yet. Add a message below to update the thread.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {comments.map((c) => {
                  const internal = c.is_internal === 1;
                  return (
                    <div
                      key={c.id}
                      className={`px-6 py-4 ${internal ? 'bg-amber-50/60' : 'bg-white'}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">{c.author_name}</span>
                          <span aria-hidden="true" className="text-slate-300">
                            ·
                          </span>
                          <span className="text-slate-500">{ROLE_LABELS[c.author_role]}</span>
                          {internal && (
                            <>
                              <span aria-hidden="true" className="text-slate-300">
                                ·
                              </span>
                              <span className="inline-flex items-center gap-1 font-medium text-amber-800">
                                <Lock className="h-3 w-3" aria-hidden="true" />
                                Internal Staff Note
                              </span>
                            </>
                          )}
                        </div>
                        <span className="text-slate-400 font-mono tabular-nums">
                          {formatExactDate(c.created_at)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
                        {c.body}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            <form onSubmit={handlePostComment} className="p-6 border-t border-slate-200 bg-slate-50/50">
              {canEditStaffFields && (
                <div className="mb-3 flex items-center gap-1 p-1 bg-slate-200/70 rounded-md w-fit">
                  <button
                    type="button"
                    onClick={() => setIsInternal(false)}
                    className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                      !isInternal
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Public Reply
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsInternal(true)}
                    className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                      isInternal
                        ? 'bg-amber-100 text-amber-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>Internal Note</span>
                  </button>
                </div>
              )}

              <textarea
                rows={3}
                required
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder={
                  isInternal
                    ? 'Add a private note visible only to department staff and administrators...'
                    : 'Write a reply visible to the requester...'
                }
                className={`w-full rounded-md border px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none ${
                  isInternal
                    ? 'border-amber-300 bg-amber-50/40 focus:border-amber-600'
                    : 'border-slate-300 bg-white focus:border-blue-600'
                }`}
              />

              <div className="mt-3 flex items-center justify-between gap-4">
                <span className="text-xs text-slate-500">
                  {isInternal
                    ? 'Students cannot view internal staff notes.'
                    : 'Visible in the student ticket thread.'}
                </span>
                <button
                  type="submit"
                  disabled={postingReply || !replyBody.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Send className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{postingReply ? 'Sending...' : isInternal ? 'Save Note' : 'Send Reply'}</span>
                </button>
              </div>
            </form>
          </section>
        </div>

        <aside className="lg:col-span-4 space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-slate-500">Status</span>
                <StatusLabel status={ticket.status} />
              </div>

              {canEditStaffFields && (
                <div>
                  <label htmlFor="detail-status" className="block text-xs font-medium text-slate-500 mb-1.5">
                    Transition workflow state
                  </label>
                  <select
                    id="detail-status"
                    disabled={updatingMeta}
                    value={ticket.status}
                    onChange={(e) => void patchTicket({ status: e.target.value })}
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    <option value={ticket.status}>{STATUS_LABELS[ticket.status]} (current)</option>
                    {availableNextStatuses.map((s) => (
                      <option key={s} value={s}>
                        Move to {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-slate-500">Priority</span>
                {canEditStaffFields ? (
                  <select
                    aria-label="Ticket priority"
                    disabled={updatingMeta}
                    value={ticket.priority}
                    onChange={(e) =>
                      void patchTicket({ priority: e.target.value as TicketPriority })
                    }
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                ) : (
                  <PriorityLabel priority={ticket.priority} />
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-slate-500">Department</span>
                {currentUser.role === 'admin' ? (
                  <select
                    aria-label="Ticket department"
                    disabled={updatingMeta}
                    value={String(ticket.department_id)}
                    onChange={(e) =>
                      void patchTicket({ department_id: Number(e.target.value) })
                    }
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none max-w-[180px]"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={String(d.id)}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs font-medium text-slate-900 text-right">
                    {ticket.department_name}
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-slate-500">Assignee</span>
                  {canEditStaffFields && ticket.assigned_to_id !== currentUser.id && (
                    <button
                      type="button"
                      disabled={updatingMeta}
                      onClick={() => void patchTicket({ assigned_to_id: currentUser.id })}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer whitespace-nowrap"
                    >
                      Assign to me
                    </button>
                  )}
                </div>
                {canEditStaffFields ? (
                  <select
                    aria-label="Ticket assignee"
                    disabled={updatingMeta}
                    value={ticket.assigned_to_id ? String(ticket.assigned_to_id) : ''}
                    onChange={(e) =>
                      void patchTicket({
                        assigned_to_id: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    <option value="">Unassigned</option>
                    {assignableStaff.map((u) => (
                      <option key={u.id} value={String(u.id)}>
                        {u.full_name} ({u.department_name ?? 'Admin'})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-xs font-medium text-slate-900">
                    {ticket.assigned_to_name ?? 'Awaiting assignment'}
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">SLA Status</span>
                <span
                  className={`font-mono tabular-nums font-medium ${
                    sla.tone === 'overdue'
                      ? 'text-red-700'
                      : sla.tone === 'warning'
                        ? 'text-amber-700'
                        : 'text-slate-900'
                  }`}
                >
                  {sla.label}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">SLA Deadline</span>
                <span className="font-mono tabular-nums text-slate-600">
                  {formatExactDate(ticket.sla_due_at)}
                </span>
              </div>
              {ticket.resolved_at && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Resolved At</span>
                  <span className="font-mono tabular-nums text-emerald-700">
                    {formatExactDate(ticket.resolved_at)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h2 className="font-display text-sm font-semibold text-slate-900">Audit Log</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {auditLogs.map((log) => (
                <div key={log.id} className="px-5 py-3 text-xs">
                  <div className="font-medium text-slate-800">{describeAuditEntry(log)}</div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-slate-500">
                    <span>{log.actor_name ?? 'System'}</span>
                    <span className="font-mono tabular-nums">
                      {formatExactDate(log.created_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
