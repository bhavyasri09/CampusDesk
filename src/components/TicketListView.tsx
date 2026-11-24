import { Download, MessageSquare, Plus, Search } from 'lucide-react';
import { formatRelativeTime, formatSlaRemaining } from '../lib/api';
import type { Department, Ticket, TicketPriority, TicketStatus, UserRole } from '../types';
import { PriorityLabel, StatusLabel } from './StatusAndPriority';

export type StatusFilter = 'all' | TicketStatus | 'overdue';

interface TicketListViewProps {
  tickets: Ticket[];
  departments: Department[];
  loading: boolean;
  userRole: UserRole;
  statusFilter: StatusFilter;
  priorityFilter: '' | TicketPriority;
  departmentFilter: string;
  assignedFilter: '' | 'me' | 'unassigned';
  searchQuery: string;
  onStatusFilterChange: (next: StatusFilter) => void;
  onPriorityFilterChange: (next: '' | TicketPriority) => void;
  onDepartmentFilterChange: (next: string) => void;
  onAssignedFilterChange: (next: '' | 'me' | 'unassigned') => void;
  onSearchChange: (next: string) => void;
  onSelectTicket: (ticketId: number) => void;
  onOpenNewTicket: () => void;
  onExportCsv: () => void;
}

const FILTER_TABS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'waiting_on_student', label: 'Waiting' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'overdue', label: 'Overdue SLA' },
];

export function TicketListView({
  tickets,
  departments,
  loading,
  userRole,
  statusFilter,
  priorityFilter,
  departmentFilter,
  assignedFilter,
  searchQuery,
  onStatusFilterChange,
  onPriorityFilterChange,
  onDepartmentFilterChange,
  onAssignedFilterChange,
  onSearchChange,
  onSelectTicket,
  onOpenNewTicket,
  onExportCsv,
}: TicketListViewProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onStatusFilterChange(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:flex-initial sm:w-64">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search code, title, student..."
              aria-label="Search tickets"
              className="w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <select
            value={priorityFilter}
            onChange={(e) => onPriorityFilterChange(e.target.value as '' | TicketPriority)}
            aria-label="Filter by priority"
            className="rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 focus:border-blue-600 focus:outline-none"
          >
            <option value="">All priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {userRole !== 'staff' && (
            <select
              value={departmentFilter}
              onChange={(e) => onDepartmentFilterChange(e.target.value)}
              aria-label="Filter by department"
              className="rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 focus:border-blue-600 focus:outline-none"
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.name}
                </option>
              ))}
            </select>
          )}

          {userRole !== 'student' && (
            <>
              <select
                value={assignedFilter}
                onChange={(e) =>
                  onAssignedFilterChange(e.target.value as '' | 'me' | 'unassigned')
                }
                aria-label="Filter by assignment"
                className="rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 focus:border-blue-600 focus:outline-none"
              >
                <option value="">All assignees</option>
                <option value="me">Assigned to me</option>
                <option value="unassigned">Unassigned</option>
              </select>

              <button
                type="button"
                onClick={onExportCsv}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Export CSV</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-2.5 pl-4 pr-3 whitespace-nowrap">Ticket</th>
                <th className="py-2.5 px-3">Subject &amp; Department</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Status</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Priority</th>
                {userRole !== 'student' && (
                  <th className="py-2.5 px-3 whitespace-nowrap">Requester / Assignee</th>
                )}
                <th className="py-2.5 px-3 text-right whitespace-nowrap">SLA Target</th>
                <th className="py-2.5 pl-3 pr-4 text-right whitespace-nowrap">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {loading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} className="h-12">
                    <td className="py-3 pl-4 pr-3">
                      <div className="h-3.5 w-16 bg-slate-100 rounded animate-pulse" />
                    </td>
                    <td className="py-3 px-3">
                      <div className="h-3.5 w-64 bg-slate-100 rounded animate-pulse" />
                    </td>
                    <td className="py-3 px-3">
                      <div className="h-3.5 w-20 bg-slate-100 rounded animate-pulse" />
                    </td>
                    <td className="py-3 px-3">
                      <div className="h-3.5 w-16 bg-slate-100 rounded animate-pulse" />
                    </td>
                    {userRole !== 'student' && (
                      <td className="py-3 px-3">
                        <div className="h-3.5 w-28 bg-slate-100 rounded animate-pulse" />
                      </td>
                    )}
                    <td className="py-3 px-3">
                      <div className="h-3.5 w-20 ml-auto bg-slate-100 rounded animate-pulse" />
                    </td>
                    <td className="py-3 pl-3 pr-4">
                      <div className="h-3.5 w-14 ml-auto bg-slate-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : tickets.length === 0 ? (
                <tr>
                  <td
                    colSpan={userRole !== 'student' ? 7 : 6}
                    className="py-14 px-6 text-center"
                  >
                    <p className="text-sm font-medium text-slate-900">
                      No tickets match the current view
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Adjust your search or status filter, or raise a new support ticket.
                    </p>
                    <button
                      type="button"
                      onClick={onOpenNewTicket}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>New Ticket</span>
                    </button>
                  </td>
                </tr>
              ) : (
                tickets.map((ticket) => {
                  const sla = formatSlaRemaining(ticket.sla_due_at, ticket.status);
                  const slaColor =
                    sla.tone === 'overdue'
                      ? 'text-red-700 font-semibold'
                      : sla.tone === 'warning'
                        ? 'text-amber-700 font-medium'
                        : sla.tone === 'done'
                          ? 'text-slate-400'
                          : 'text-slate-600';

                  return (
                    <tr
                      key={ticket.id}
                      onClick={() => onSelectTicket(ticket.id)}
                      className="hover:bg-slate-50/90 transition-colors cursor-pointer group"
                    >
                      <td className="py-3 pl-4 pr-3 align-middle">
                        <span className="font-mono text-xs font-medium text-slate-500 tabular-nums whitespace-nowrap">
                          {ticket.ticket_code}
                        </span>
                      </td>

                      <td className="py-3 px-3 align-middle max-w-md">
                        <div className="font-medium text-slate-900 group-hover:text-blue-700 transition-colors truncate">
                          {ticket.title}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 truncate">
                          <span>{ticket.department_name}</span>
                          {ticket.location && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="truncate">{ticket.location}</span>
                            </>
                          )}
                          {typeof ticket.comment_count === 'number' && ticket.comment_count > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 tabular-nums">
                                <MessageSquare className="h-3 w-3" aria-hidden="true" />
                                {ticket.comment_count}
                              </span>
                            </>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3 align-middle">
                        <StatusLabel status={ticket.status} />
                      </td>

                      <td className="py-3 px-3 align-middle">
                        <PriorityLabel priority={ticket.priority} />
                      </td>

                      {userRole !== 'student' && (
                        <td className="py-3 px-3 align-middle">
                          <div className="text-xs text-slate-900 truncate max-w-[160px]">
                            {ticket.student_name}
                          </div>
                          <div className="text-xs text-slate-500 truncate max-w-[160px]">
                            {ticket.assigned_to_name ? `→ ${ticket.assigned_to_name}` : 'Unassigned'}
                          </div>
                        </td>
                      )}

                      <td className="py-3 px-3 align-middle text-right">
                        <span className={`font-mono text-xs tabular-nums whitespace-nowrap ${slaColor}`}>
                          {sla.label}
                        </span>
                      </td>

                      <td className="py-3 pl-3 pr-4 align-middle text-right">
                        <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap">
                          {formatRelativeTime(ticket.updated_at)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
