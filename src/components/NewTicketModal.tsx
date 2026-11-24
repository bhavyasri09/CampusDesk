import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { apiFetch, suggestDepartment } from '../lib/api';
import type { Department, SlaPolicy, Ticket, TicketPriority } from '../types';

interface NewTicketModalProps {
  departments: Department[];
  slaPolicies: SlaPolicy[];
  onClose: () => void;
  onCreated: (ticket: Ticket) => void;
}

export function NewTicketModal({
  departments,
  slaPolicies,
  onClose,
  onCreated,
}: NewTicketModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [departmentId, setDepartmentId] = useState<string>('auto');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detectedDept = useMemo(
    () => suggestDepartment(title, description, departments),
    [title, description, departments]
  );

  const activePolicy = useMemo(
    () => slaPolicies.find((p) => p.priority === priority),
    [slaPolicies, priority]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        title,
        description,
        location,
        priority,
      };
      if (departmentId !== 'auto') {
        payload.department_id = Number(departmentId);
      }
      const res = await apiFetch<{ ticket: Ticket }>('/tickets', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      onCreated(res.ticket);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-ticket-title"
    >
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="new-ticket-title" className="font-display text-base font-semibold text-slate-900">
              Raise Support Ticket
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Tickets are routed automatically by keywords or assigned directly to a campus unit.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="ticket-title" className="block text-sm font-medium text-slate-700">
              Issue summary
            </label>
            <input
              id="ticket-title"
              type="text"
              required
              minLength={5}
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Hostel Room 214 water pipe leakage"
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ticket-dept" className="block text-sm font-medium text-slate-700">
                Department routing
              </label>
              <select
                id="ticket-dept"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="auto">
                  Auto-route{detectedDept ? ` (${detectedDept.name})` : ''}
                </option>
                {departments.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ticket-priority" className="block text-sm font-medium text-slate-700">
                Priority
              </label>
              <select
                id="ticket-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TicketPriority)}
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="ticket-location" className="block text-sm font-medium text-slate-700">
              Location or portal module <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              id="ticket-location"
              type="text"
              maxLength={120}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Block B Room 108, Central Library, Moodle"
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="ticket-desc" className="block text-sm font-medium text-slate-700">
              Detailed description
            </label>
            <textarea
              id="ticket-desc"
              required
              minLength={10}
              maxLength={4000}
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Include exact room/building numbers, course code, error message, or when the issue started."
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
            <span>
              Routing:{' '}
              <strong className="font-medium text-slate-700">
                {departmentId === 'auto'
                  ? detectedDept?.name ?? departments[0]?.name ?? 'IT Support'
                  : departments.find((d) => String(d.id) === departmentId)?.name}
              </strong>
            </span>
            {activePolicy && (
              <span className="font-mono tabular-nums">
                SLA target: {activePolicy.resolution_hours}h resolution
              </span>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {submitting ? 'Submitting...' : 'Submit Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
