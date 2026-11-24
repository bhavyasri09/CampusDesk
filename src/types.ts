export type UserRole = 'student' | 'staff' | 'admin';

export type TicketStatus =
  | 'open'
  | 'in_progress'
  | 'waiting_on_student'
  | 'resolved'
  | 'closed';

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface User {
  id: number;
  full_name: string;
  email: string;
  role: UserRole;
  department_id: number | null;
  department_name: string | null;
  is_active: number;
  created_at?: string;
}

export interface Department {
  id: number;
  name: string;
  description: string;
  keywords: string;
  created_at: string;
  active_ticket_count?: number;
  staff_count?: number;
}

export interface SlaPolicy {
  priority: TicketPriority;
  response_hours: number;
  resolution_hours: number;
  updated_at: string;
}

export interface Ticket {
  id: number;
  ticket_code: string;
  title: string;
  description: string;
  location: string;
  status: TicketStatus;
  priority: TicketPriority;
  student_id: number;
  student_name: string;
  student_email: string;
  department_id: number;
  department_name: string;
  assigned_to_id: number | null;
  assigned_to_name: string | null;
  sla_due_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  is_overdue: boolean;
  comment_count?: number;
}

export interface TicketComment {
  id: number;
  ticket_id: number;
  author_id: number;
  author_name: string;
  author_role: UserRole;
  body: string;
  is_internal: number;
  created_at: string;
}

export interface AuditLog {
  id: number;
  ticket_id: number;
  actor_id: number | null;
  actor_name: string | null;
  actor_role: UserRole | null;
  action: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export interface AnalyticsData {
  summary: {
    total_tickets: number;
    open_queue: number;
    resolved_tickets: number;
    overdue_active: number;
    sla_compliance_rate: number;
    avg_resolution_hours: number;
  };
  by_status: Record<TicketStatus, number>;
  by_priority: Record<TicketPriority, number>;
  by_department: Array<{
    department_id: number;
    department_name: string;
    total: number;
    active: number;
    resolved: number;
    overdue: number;
  }>;
}

export interface DemoAccountInfo {
  full_name: string;
  email: string;
  role: UserRole;
  department?: string;
}
