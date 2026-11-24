import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { AnalyticsData, TicketPriority, TicketStatus, UserRole } from '../types';
import { PRIORITY_LABELS, STATUS_LABELS } from './StatusAndPriority';

interface AnalyticsViewProps {
  userRole: UserRole;
  departmentName: string | null;
}

export function AnalyticsView({ userRole, departmentName }: AnalyticsViewProps) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch<AnalyticsData>('/analytics')
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load analytics');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-28 bg-white border border-slate-200 rounded-lg animate-pulse" />
        <div className="h-64 bg-white border border-slate-200 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-6 text-sm text-red-700">
        {error ?? 'Analytics unavailable'}
      </div>
    );
  }

  const { summary, by_status, by_priority, by_department } = data;
  const maxTotal = Math.max(1, summary.total_tickets);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-display text-lg font-semibold text-slate-900">
            {userRole === 'staff' && departmentName
              ? `${departmentName} Operations`
              : 'Campus Helpdesk Analytics'}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Live SLA compliance, resolution velocity, and queue distribution calculated from ticket records.
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Total Tickets</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {summary.total_tickets}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {summary.resolved_tickets} resolved or closed
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Active Open Queue</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {summary.open_queue}
          </div>
          <div
            className={`mt-1 text-xs tabular-nums ${
              summary.overdue_active > 0 ? 'text-red-700 font-medium' : 'text-slate-500'
            }`}
          >
            {summary.overdue_active} overdue SLA
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">SLA Compliance</div>
          <div
            className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
              summary.sla_compliance_rate >= 85
                ? 'text-emerald-700'
                : summary.sla_compliance_rate >= 70
                  ? 'text-amber-700'
                  : 'text-red-700'
            }`}
          >
            {summary.sla_compliance_rate}%
          </div>
          <div className="mt-1 text-xs text-slate-500">Resolved within deadline</div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Avg Resolution Time</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {summary.avg_resolution_hours}h
          </div>
          <div className="mt-1 text-xs text-slate-500">From intake to resolution</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Department Workload &amp; SLA Health
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 pl-5 pr-3">Department</th>
                  <th className="py-2.5 px-3 text-right">Active</th>
                  <th className="py-2.5 px-3 text-right">Resolved</th>
                  <th className="py-2.5 px-3 text-right">Overdue</th>
                  <th className="py-2.5 pl-3 pr-5 text-right">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {by_department.map((dept) => {
                  const pct = Math.round((dept.total / maxTotal) * 100);
                  return (
                    <tr key={dept.department_id} className="h-11">
                      <td className="py-2.5 pl-5 pr-3 font-medium text-slate-900">
                        {dept.department_name}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                        {dept.active}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700">
                        {dept.resolved}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono tabular-nums ${
                          dept.overdue > 0 ? 'text-red-700 font-semibold' : 'text-slate-400'
                        }`}
                      >
                        {dept.overdue}
                      </td>
                      <td className="py-2.5 pl-3 pr-5 text-right">
                        <div className="inline-flex items-center gap-2 justify-end w-28">
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-600 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="font-mono tabular-nums text-slate-600 w-8 text-right">
                            {pct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
          <div className="p-5">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Volume by Workflow Status
            </h2>
            <div className="mt-4 space-y-3">
              {(Object.keys(by_status) as TicketStatus[]).map((status) => {
                const count = by_status[status];
                const pct = Math.round((count / maxTotal) * 100);
                return (
                  <div key={status} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-700">{STATUS_LABELS[status]}</span>
                      <span className="font-mono tabular-nums text-slate-900 font-medium">
                        {count}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-slate-700 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-5">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Volume by Priority Tier
            </h2>
            <div className="mt-4 space-y-3">
              {(Object.keys(by_priority) as TicketPriority[]).map((priority) => {
                const count = by_priority[priority];
                const pct = Math.round((count / maxTotal) * 100);
                const barColor =
                  priority === 'urgent'
                    ? 'bg-red-600'
                    : priority === 'high'
                      ? 'bg-amber-500'
                      : priority === 'medium'
                        ? 'bg-blue-600'
                        : 'bg-slate-400';
                return (
                  <div key={priority} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-700">{PRIORITY_LABELS[priority]}</span>
                      <span className="font-mono tabular-nums text-slate-900 font-medium">
                        {count}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
