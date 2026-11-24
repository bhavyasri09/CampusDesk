import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Inbox,
  LogOut,
  Menu,
  Plus,
  Settings2,
  X,
} from 'lucide-react';
import { AdminDirectoryView } from './components/AdminDirectoryView';
import { AnalyticsView } from './components/AnalyticsView';
import { AuthScreen } from './components/AuthScreen';
import { NewTicketModal } from './components/NewTicketModal';
import { ROLE_LABELS } from './components/StatusAndPriority';
import { TicketDetailView } from './components/TicketDetailView';
import { type StatusFilter, TicketListView } from './components/TicketListView';
import { apiFetch, downloadTicketsCsv, setAuthToken } from './lib/api';
import type {
  DemoAccountInfo,
  Department,
  SlaPolicy,
  Ticket,
  TicketPriority,
  User,
} from './types';

type ActiveSection = 'tickets' | 'analytics' | 'admin';

export default function App() {
  const [bootChecking, setBootChecking] = useState(true);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [recentDemoAccounts, setRecentDemoAccounts] = useState<DemoAccountInfo[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [section, setSection] = useState<ActiveSection>('tickets');
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [newTicketOpen, setNewTicketOpen] = useState(false);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [slaPolicies, setSlaPolicies] = useState<SlaPolicy[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<User[]>([]);

  // Ticket Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<'' | TicketPriority>('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('');
  const [assignedFilter, setAssignedFilter] = useState<'' | 'me' | 'unassigned'>('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    apiFetch<{ needsBootstrap: boolean }>('/auth/bootstrap-status')
      .then((res) => setNeedsBootstrap(res.needsBootstrap))
      .catch(() => setNeedsBootstrap(false))
      .finally(() => setBootChecking(false));
  }, []);

  const buildTicketQueryString = useCallback(() => {
    const params = new URLSearchParams();
    if (statusFilter === 'overdue') {
      params.set('overdue', 'true');
    } else if (statusFilter !== 'all') {
      params.set('status', statusFilter);
    }
    if (priorityFilter) params.set('priority', priorityFilter);
    if (departmentFilter) params.set('department_id', departmentFilter);
    if (assignedFilter) params.set('assigned', assignedFilter);
    if (searchQuery.trim()) params.set('search', searchQuery.trim());
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }, [statusFilter, priorityFilter, departmentFilter, assignedFilter, searchQuery]);

  const fetchTickets = useCallback(async () => {
    if (!currentUser) return;
    setTicketsLoading(true);
    try {
      const qs = buildTicketQueryString();
      const res = await apiFetch<{ tickets: Ticket[] }>(`/tickets${qs}`);
      setTickets(res.tickets);
    } catch {
      // Keep previous list on transient error
    } finally {
      setTicketsLoading(false);
    }
  }, [currentUser, buildTicketQueryString]);

  const fetchReferenceData = useCallback(async () => {
    if (!currentUser) return;
    try {
      const [deptRes, slaRes] = await Promise.all([
        apiFetch<{ departments: Department[] }>('/departments'),
        apiFetch<{ policies: SlaPolicy[] }>('/sla-policies'),
      ]);
      setDepartments(deptRes.departments);
      setSlaPolicies(slaRes.policies);

      if (currentUser.role === 'admin' || currentUser.role === 'staff') {
        const usersRes = await apiFetch<{ users: User[] }>('/users');
        setDirectoryUsers(usersRes.users);
      } else {
        setDirectoryUsers([]);
      }
    } catch {
      // handled silently
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    void fetchReferenceData();
  }, [currentUser, fetchReferenceData]);

  useEffect(() => {
    if (!currentUser) return;
    const handle = window.setTimeout(() => {
      void fetchTickets();
    }, 120);
    return () => window.clearTimeout(handle);
  }, [currentUser, fetchTickets]);

  function handleAuthenticated(user: User, demoAccounts?: DemoAccountInfo[]) {
    setNeedsBootstrap(false);
    if (demoAccounts && demoAccounts.length > 0) {
      setRecentDemoAccounts(demoAccounts);
    }
    setCurrentUser(user);
    setSection('tickets');
    setSelectedTicketId(null);
  }

  function handleSignOut() {
    setAuthToken(null);
    setCurrentUser(null);
    setTickets([]);
    setSelectedTicketId(null);
    setSection('tickets');
    setStatusFilter('all');
    setPriorityFilter('');
    setDepartmentFilter('');
    setAssignedFilter('');
    setSearchQuery('');
  }

  if (bootChecking) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">
        Loading workspace...
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AuthScreen
        needsBootstrap={needsBootstrap}
        recentDemoAccounts={recentDemoAccounts}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  const navItems: Array<{
    id: ActiveSection;
    label: string;
    Icon: typeof Inbox;
    visible: boolean;
  }> = [
    { id: 'tickets', label: 'Tickets', Icon: Inbox, visible: true },
    {
      id: 'analytics',
      label: 'Analytics',
      Icon: BarChart3,
      visible: currentUser.role === 'admin' || currentUser.role === 'staff',
    },
    {
      id: 'admin',
      label: 'Administration',
      Icon: Settings2,
      visible: currentUser.role === 'admin',
    },
  ];

  const activeTicketCode =
    selectedTicketId !== null
      ? tickets.find((t) => t.id === selectedTicketId)?.ticket_code ?? `#${selectedTicketId}`
      : null;

  const breadcrumbLabel =
    section === 'tickets'
      ? activeTicketCode
        ? `Tickets / ${activeTicketCode}`
        : currentUser.role === 'student'
          ? 'My Tickets'
          : currentUser.role === 'staff'
            ? `${currentUser.department_name ?? 'Department'} Queue`
            : 'All Campus Tickets'
      : section === 'analytics'
        ? 'Operations Analytics'
        : 'Administration & SLA Policies';

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-60">
      <div className="h-14 px-5 flex items-center justify-between border-b border-slate-200 shrink-0">
        <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
          CampusDesk
        </span>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close navigation"
          className="lg:hidden p-1 text-slate-500 hover:text-slate-900"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1" aria-label="Primary navigation">
        {navItems
          .filter((item) => item.visible)
          .map(({ id, label, Icon }) => {
            const active = section === id && selectedTicketId === null;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setSection(id);
                  setSelectedTicketId(null);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
      </nav>

      <div className="p-4 border-t border-slate-200 space-y-3">
        <div>
          <div className="text-sm font-medium text-slate-900 truncate">
            {currentUser.full_name}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 truncate">
            {ROLE_LABELS[currentUser.role]}
            {currentUser.department_name ? ` · ${currentUser.department_name}` : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="hidden lg:block shrink-0">{sidebarContent}</aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/30"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-50">{sidebarContent}</div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation"
              className="lg:hidden p-1.5 rounded-md text-slate-600 hover:bg-slate-100"
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="text-sm font-medium text-slate-700 truncate">
              <span className="text-slate-400">Workspace / </span>
              <span className="text-slate-900">{breadcrumbLabel}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setNewTicketOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>New Ticket</span>
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          {section === 'tickets' && selectedTicketId !== null ? (
            <TicketDetailView
              ticketId={selectedTicketId}
              currentUser={currentUser}
              departments={departments}
              staffUsers={directoryUsers}
              onBack={() => setSelectedTicketId(null)}
              onTicketUpdated={() => {
                void fetchTickets();
              }}
            />
          ) : section === 'tickets' ? (
            <TicketListView
              tickets={tickets}
              departments={departments}
              loading={ticketsLoading}
              userRole={currentUser.role}
              statusFilter={statusFilter}
              priorityFilter={priorityFilter}
              departmentFilter={departmentFilter}
              assignedFilter={assignedFilter}
              searchQuery={searchQuery}
              onStatusFilterChange={setStatusFilter}
              onPriorityFilterChange={setPriorityFilter}
              onDepartmentFilterChange={setDepartmentFilter}
              onAssignedFilterChange={setAssignedFilter}
              onSearchChange={setSearchQuery}
              onSelectTicket={(id) => setSelectedTicketId(id)}
              onOpenNewTicket={() => setNewTicketOpen(true)}
              onExportCsv={() => void downloadTicketsCsv(buildTicketQueryString())}
            />
          ) : section === 'analytics' && currentUser.role !== 'student' ? (
            <AnalyticsView
              userRole={currentUser.role}
              departmentName={currentUser.department_name}
            />
          ) : section === 'admin' && currentUser.role === 'admin' ? (
            <AdminDirectoryView
              currentUser={currentUser}
              users={directoryUsers}
              departments={departments}
              slaPolicies={slaPolicies}
              onRefreshData={fetchReferenceData}
            />
          ) : null}
        </main>
      </div>

      {newTicketOpen && (
        <NewTicketModal
          departments={departments}
          slaPolicies={slaPolicies}
          onClose={() => setNewTicketOpen(false)}
          onCreated={(created) => {
            setNewTicketOpen(false);
            setSection('tickets');
            setSelectedTicketId(created.id);
            void fetchTickets();
          }}
        />
      )}
    </div>
  );
}
