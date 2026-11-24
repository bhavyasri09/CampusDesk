import { useState } from 'react';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import { apiFetch, setAuthToken } from '../lib/api';
import type { DemoAccountInfo, User } from '../types';

interface AuthScreenProps {
  needsBootstrap: boolean;
  recentDemoAccounts: DemoAccountInfo[];
  onAuthenticated: (user: User, demoAccounts?: DemoAccountInfo[]) => void;
}

export function AuthScreen({
  needsBootstrap,
  recentDemoAccounts,
  onAuthenticated,
}: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [seedSampleData, setSeedSampleData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (needsBootstrap) {
        const res = await apiFetch<{
          token: string;
          user: User;
          demoAccounts?: DemoAccountInfo[];
        }>('/auth/bootstrap', {
          method: 'POST',
          body: JSON.stringify({
            full_name: fullName,
            email,
            password,
            seed_sample_data: seedSampleData,
          }),
        });
        setAuthToken(res.token);
        onAuthenticated(res.user, res.demoAccounts);
        return;
      }

      if (mode === 'register') {
        const res = await apiFetch<{ token: string; user: User }>('/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            full_name: fullName,
            email,
            password,
          }),
        });
        setAuthToken(res.token);
        onAuthenticated(res.user);
        return;
      }

      const res = await apiFetch<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        <div className="lg:col-span-5 pt-2">
          <div className="font-display text-2xl font-bold tracking-tight text-slate-900">
            CampusDesk
          </div>
          <h1
            className="mt-4 font-display text-3xl font-semibold tracking-tight text-slate-900 leading-tight"
            style={{ textWrap: 'balance' }}
          >
            Student support, department routing, and SLA tracking in one place.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Submit campus requests, route tickets automatically to IT, Hostel, Exams, or Accounts,
            and track every status change from intake through resolution.
          </p>

          <dl className="mt-8 divide-y divide-slate-200 border-y border-slate-200 text-sm">
            <div className="py-3 flex items-baseline justify-between gap-4">
              <dt className="font-medium text-slate-700">Role-based access</dt>
              <dd className="text-slate-500 text-right">Student, Staff, Admin</dd>
            </div>
            <div className="py-3 flex items-baseline justify-between gap-4">
              <dt className="font-medium text-slate-700">SLA enforcement</dt>
              <dd className="text-slate-500 font-mono text-xs tabular-nums text-right">
                4h Urgent · 24h High · 48h Medium
              </dd>
            </div>
            <div className="py-3 flex items-baseline justify-between gap-4">
              <dt className="font-medium text-slate-700">Audit trail</dt>
              <dd className="text-slate-500 text-right">Immutable history &amp; staff notes</dd>
            </div>
          </dl>

          {!needsBootstrap && recentDemoAccounts.length > 0 && (
            <div className="mt-6 border border-slate-200 bg-white rounded-lg p-4">
              <p className="text-xs font-semibold text-slate-900">
                Sample accounts initialized in this workspace
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Sign in with any email below using the setup password you created:
              </p>
              <ul className="mt-2.5 space-y-1.5 text-xs">
                {recentDemoAccounts.map((acc) => (
                  <li key={acc.email} className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        setEmail(acc.email);
                      }}
                      className="font-mono text-blue-700 hover:underline text-left truncate"
                    >
                      {acc.email}
                    </button>
                    <span className="text-slate-500 whitespace-nowrap shrink-0">
                      {acc.role === 'staff' ? acc.department : acc.role}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6 sm:p-8">
          {needsBootstrap ? (
            <div>
              <div className="flex items-center gap-2 text-blue-700">
                <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="text-sm font-semibold">First-run workspace setup</span>
              </div>
              <h2 className="mt-2 font-display text-xl font-semibold text-slate-900">
                Create the primary administrator account
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Choose your administrator credentials to initialize the database and lock workspace
                provisioning.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  mode === 'login'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className={`px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  mode === 'register'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Student Sign Up
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {(needsBootstrap || mode === 'register') && (
              <div>
                <label htmlFor="auth-fullname" className="block text-sm font-medium text-slate-700">
                  Full name
                </label>
                <input
                  id="auth-fullname"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={needsBootstrap ? 'e.g. Dr. Priya Kulkarni' : 'e.g. Ananya Verma'}
                  className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                />
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-sm font-medium text-slate-700">
                Campus email
              </label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={needsBootstrap ? 'admin@campus.edu' : 'name@campus.edu'}
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
              />
            </div>

            {needsBootstrap && (
              <label className="flex items-start gap-2.5 pt-1 text-sm text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={seedSampleData}
                  onChange={(e) => setSeedSampleData(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <span>
                  Populate sample campus tickets, departments, staff, and student accounts (using
                  this password so you can preview all roles).
                </span>
              </label>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>
                {submitting
                  ? 'Processing...'
                  : needsBootstrap
                    ? 'Initialize Workspace & Sign In'
                    : mode === 'register'
                      ? 'Create Student Account'
                      : 'Sign In'}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
