import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Circle,
  Clock,
  HelpCircle,
  Minus,
} from 'lucide-react';
import type { TicketPriority, TicketStatus, UserRole } from '../types';

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  waiting_on_student: 'Waiting on Student',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  student: 'Student',
  staff: 'Department Staff',
  admin: 'Administrator',
};

export function StatusLabel({ status }: { status: TicketStatus }) {
  const config: Record<
    TicketStatus,
    { color: string; Icon: typeof Circle }
  > = {
    open: { color: 'text-blue-700', Icon: Circle },
    in_progress: { color: 'text-indigo-700', Icon: Clock },
    waiting_on_student: { color: 'text-amber-700', Icon: HelpCircle },
    resolved: { color: 'text-emerald-700', Icon: CheckCircle2 },
    closed: { color: 'text-slate-500', Icon: Archive },
  };

  const { color, Icon } = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${color}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{STATUS_LABELS[status]}</span>
    </span>
  );
}

export function PriorityLabel({ priority }: { priority: TicketPriority }) {
  const config: Record<
    TicketPriority,
    { color: string; Icon: typeof Minus }
  > = {
    urgent: { color: 'text-red-700 font-semibold', Icon: AlertTriangle },
    high: { color: 'text-amber-700 font-medium', Icon: ArrowUp },
    medium: { color: 'text-slate-700 font-medium', Icon: Minus },
    low: { color: 'text-slate-500', Icon: ArrowDown },
  };

  const { color, Icon } = config[priority];
  return (
    <span className={`inline-flex items-center gap-1 text-xs whitespace-nowrap ${color}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{PRIORITY_LABELS[priority]}</span>
    </span>
  );
}
