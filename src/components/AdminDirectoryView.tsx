import { useState } from 'react';
import { Plus } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Department, SlaPolicy, TicketPriority, User, UserRole } from '../types';
import { PRIORITY_LABELS } from './StatusAndPriority';

interface AdminDirectoryViewProps {
  currentUser: User;
  users: User[];
  departments: Department[];
  slaPolicies: SlaPolicy[];
  onRefreshData: () => Promise<void>;
}

export function AdminDirectoryView({
  currentUser,
  users,
  departments,
  slaPolicies,
  onRefreshData,
}: AdminDirectoryViewProps) {
  const [tab, setTab] = useState<'users' | 'departments' | 'sla'>('users');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Add User Form
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('staff');
  const [newDeptId, setNewDeptId] = useState<string>(
    departments[0] ? String(departments[0].id) : ''
  );
  const [creatingUser, setCreatingUser] = useState(false);

  // Add Department Form
  const [deptName, setDeptName] = useState('');
  const [deptDesc, setDeptDesc] = useState('');
  const [deptKeywords, setDeptKeywords] = useState('');
  const [creatingDept, setCreatingDept] = useState(false);

  // SLA Policy edits
  const [slaEdits, setSlaEdits] = useState<
    Record<TicketPriority, { response: number; resolution: number }>
  >(() => {
    const initial = {} as Record<TicketPriority, { response: number; resolution: number }>;
    for (const p of slaPolicies) {
      initial[p.priority] = {
        response: p.response_hours,
        resolution: p.resolution_hours,
      };
    }
    return initial;
  });

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setCreatingUser(true);
    try {
      await apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify({
          full_name: newName,
          email: newEmail,
          password: newPassword,
          role: newRole,
          department_id: newRole === 'staff' ? Number(newDeptId) : null,
        }),
      });
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setSuccessMsg('Account created.');
      await onRefreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreatingUser(false);
    }
  }

  async function handleUpdateUser(
    userId: number,
    patch: { role?: UserRole; department_id?: number | null; is_active?: boolean }
  ) {
    setError(null);
    setSuccessMsg(null);
    try {
      await apiFetch(`/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      await onRefreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    }
  }

  async function handleCreateDepartment(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setCreatingDept(true);
    try {
      await apiFetch('/departments', {
        method: 'POST',
        body: JSON.stringify({
          name: deptName,
          description: deptDesc,
          keywords: deptKeywords,
        }),
      });
      setDeptName('');
      setDeptDesc('');
      setDeptKeywords('');
      setSuccessMsg('Department added.');
      await onRefreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create department');
    } finally {
      setCreatingDept(false);
    }
  }

  async function handleSaveSla(priority: TicketPriority) {
    const edited = slaEdits[priority];
    if (!edited) return;
    setError(null);
    setSuccessMsg(null);
    try {
      await apiFetch(`/sla-policies/${priority}`, {
        method: 'PATCH',
        body: JSON.stringify({
          response_hours: edited.response,
          resolution_hours: edited.resolution,
        }),
      });
      setSuccessMsg(`Updated ${PRIORITY_LABELS[priority]} SLA commitment.`);
      await onRefreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update SLA policy');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-lg font-semibold text-slate-900">
            Administration &amp; Policies
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Manage campus staff roles, keyword-based routing departments, and SLA deadlines.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(
            [
              { id: 'users', label: 'Users & Roles' },
              { id: 'departments', label: 'Departments' },
              { id: 'sla', label: 'SLA Policies' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                setError(null);
                setSuccessMsg(null);
              }}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                tab === item.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700"
        >
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          {successMsg}
        </div>
      )}

      {tab === 'users' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Registered Accounts
              </h2>
              <span className="text-xs text-slate-500 tabular-nums">{users.length} total</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="py-2.5 pl-5 pr-3">Name &amp; Email</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3">Department</th>
                    <th className="py-2.5 pl-3 pr-5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {users.map((u) => {
                    const isSelf = u.id === currentUser.id;
                    return (
                      <tr key={u.id} className="h-12">
                        <td className="py-2.5 pl-5 pr-3">
                          <div className="font-medium text-slate-900">{u.full_name}</div>
                          <div className="font-mono text-slate-500">{u.email}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <select
                            aria-label={`Role for ${u.full_name}`}
                            disabled={isSelf}
                            value={u.role}
                            onChange={(e) => {
                              const role = e.target.value as UserRole;
                              void handleUpdateUser(u.id, {
                                role,
                                department_id:
                                  role === 'staff'
                                    ? u.department_id ?? departments[0]?.id ?? null
                                    : null,
                              });
                            }}
                            className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 disabled:opacity-60"
                          >
                            <option value="student">Student</option>
                            <option value="staff">Staff</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td className="py-2.5 px-3">
                          {u.role === 'staff' ? (
                            <select
                              aria-label={`Department for ${u.full_name}`}
                              value={u.department_id ? String(u.department_id) : ''}
                              onChange={(e) =>
                                void handleUpdateUser(u.id, {
                                  department_id: Number(e.target.value),
                                })
                              }
                              className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
                            >
                              {departments.map((d) => (
                                <option key={d.id} value={String(d.id)}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2.5 pl-3 pr-5 text-right">
                          <button
                            type="button"
                            disabled={isSelf}
                            onClick={() =>
                              void handleUpdateUser(u.id, { is_active: u.is_active !== 1 })
                            }
                            className={`text-xs font-medium cursor-pointer disabled:opacity-40 ${
                              u.is_active === 1
                                ? 'text-emerald-700 hover:underline'
                                : 'text-red-700 hover:underline'
                            }`}
                          >
                            {u.is_active === 1 ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <form
            onSubmit={handleCreateUser}
            className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-5 space-y-4"
          >
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Provision Staff or Student
            </h2>

            <div>
              <label htmlFor="u-name" className="block text-xs font-medium text-slate-700">
                Full name
              </label>
              <input
                id="u-name"
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="u-email" className="block text-xs font-medium text-slate-700">
                Campus email
              </label>
              <input
                id="u-email"
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="u-pass" className="block text-xs font-medium text-slate-700">
                Temporary password
              </label>
              <input
                id="u-pass"
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="u-role" className="block text-xs font-medium text-slate-700">
                  Role
                </label>
                <select
                  id="u-role"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  <option value="staff">Staff</option>
                  <option value="student">Student</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {newRole === 'staff' && (
                <div>
                  <label htmlFor="u-dept" className="block text-xs font-medium text-slate-700">
                    Department
                  </label>
                  <select
                    id="u-dept"
                    value={newDeptId}
                    onChange={(e) => setNewDeptId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={String(d.id)}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={creatingUser}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{creatingUser ? 'Creating...' : 'Create Account'}</span>
            </button>
          </form>
        </div>
      )}

      {tab === 'departments' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
            {departments.map((dept) => (
              <div key={dept.id} className="p-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                  <h3 className="font-display text-sm font-semibold text-slate-900">
                    {dept.name}
                  </h3>
                  <p className="mt-1 text-xs text-slate-600">{dept.description}</p>
                  {dept.keywords && (
                    <p className="mt-2 text-xs text-slate-500">
                      Auto-routing keywords:{' '}
                      <span className="font-mono text-slate-700">{dept.keywords}</span>
                    </p>
                  )}
                </div>
                <div className="flex sm:flex-col items-end gap-3 sm:gap-1 text-xs text-slate-500 shrink-0 tabular-nums">
                  <span>{dept.active_ticket_count ?? 0} active tickets</span>
                  <span>{dept.staff_count ?? 0} staff members</span>
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={handleCreateDepartment}
            className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-5 space-y-4"
          >
            <h2 className="font-display text-sm font-semibold text-slate-900">Add Department</h2>
            <div>
              <label htmlFor="d-name" className="block text-xs font-medium text-slate-700">
                Department name
              </label>
              <input
                id="d-name"
                type="text"
                required
                value={deptName}
                onChange={(e) => setDeptName(e.target.value)}
                placeholder="e.g. Library Services"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="d-desc" className="block text-xs font-medium text-slate-700">
                Scope description
              </label>
              <input
                id="d-desc"
                type="text"
                value={deptDesc}
                onChange={(e) => setDeptDesc(e.target.value)}
                placeholder="Book loans, journal access, reading rooms"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="d-kw" className="block text-xs font-medium text-slate-700">
                Routing keywords (comma-separated)
              </label>
              <input
                id="d-kw"
                type="text"
                value={deptKeywords}
                onChange={(e) => setDeptKeywords(e.target.value)}
                placeholder="library,book,isbn,borrow"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={creatingDept}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{creatingDept ? 'Saving...' : 'Add Department'}</span>
            </button>
          </form>
        </div>
      )}

      {tab === 'sla' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              SLA Response &amp; Resolution Targets
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              New tickets compute their SLA deadline automatically from the active resolution target below.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 pl-5 pr-3">Priority Tier</th>
                  <th className="py-2.5 px-3">First Response (hours)</th>
                  <th className="py-2.5 px-3">Resolution Target (hours)</th>
                  <th className="py-2.5 pl-3 pr-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {slaPolicies.map((policy) => {
                  const val = slaEdits[policy.priority] ?? {
                    response: policy.response_hours,
                    resolution: policy.resolution_hours,
                  };
                  return (
                    <tr key={policy.priority} className="h-14">
                      <td className="py-2.5 pl-5 pr-3 font-medium text-slate-900">
                        {PRIORITY_LABELS[policy.priority]}
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          min={1}
                          max={720}
                          value={val.response}
                          onChange={(e) =>
                            setSlaEdits((prev) => ({
                              ...prev,
                              [policy.priority]: {
                                ...val,
                                response: Number(e.target.value),
                              },
                            }))
                          }
                          className="w-24 rounded border border-slate-300 px-2.5 py-1.5 font-mono tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          min={1}
                          max={720}
                          value={val.resolution}
                          onChange={(e) =>
                            setSlaEdits((prev) => ({
                              ...prev,
                              [policy.priority]: {
                                ...val,
                                resolution: Number(e.target.value),
                              },
                            }))
                          }
                          className="w-24 rounded border border-slate-300 px-2.5 py-1.5 font-mono tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
                        />
                      </td>
                      <td className="py-2.5 pl-3 pr-5 text-right">
                        <button
                          type="button"
                          onClick={() => void handleSaveSla(policy.priority)}
                          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          Save Target
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
