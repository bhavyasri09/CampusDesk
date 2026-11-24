import type { Department, TicketStatus } from '../types';

let inMemoryToken: string | null = null;

export function setAuthToken(token: string | null): void {
  inMemoryToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (inMemoryToken) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }

  const res = await fetch(`/api${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // keep fallback status message
    }
    throw new ApiError(res.status, message);
  }

  return (await res.json()) as T;
}

export async function downloadTicketsCsv(queryString: string): Promise<void> {
  const headers = new Headers();
  if (inMemoryToken) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }
  const res = await fetch(`/api/tickets/export/csv${queryString}`, { headers });
  if (!res.ok) {
    throw new Error('Failed to export CSV');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'campusdesk-tickets.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function formatSlaRemaining(slaDueIso: string, status: TicketStatus): {
  label: string;
  tone: 'normal' | 'warning' | 'overdue' | 'done';
} {
  if (status === 'resolved' || status === 'closed') {
    return { label: status === 'resolved' ? 'Resolved' : 'Closed', tone: 'done' };
  }

  const diffMs = Date.parse(slaDueIso) - Date.now();
  const absMins = Math.round(Math.abs(diffMs) / 60000);
  const hours = Math.floor(absMins / 60);
  const mins = absMins % 60;
  const formatted = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  if (diffMs < 0) {
    return { label: `Overdue ${formatted}`, tone: 'overdue' };
  }
  if (diffMs < 4 * 3600 * 1000) {
    return { label: `${formatted} left`, tone: 'warning' };
  }
  return { label: `${formatted} left`, tone: 'normal' };
}

export function formatRelativeTime(iso: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (diffSec < 60) return 'Just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatExactDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function suggestDepartment(
  title: string,
  description: string,
  departments: Department[]
): Department | null {
  const haystack = `${title} ${description}`.trim().toLowerCase();
  if (!haystack || departments.length === 0) return null;

  let best: Department | null = null;
  let bestScore = 0;

  for (const dept of departments) {
    const keywords = dept.keywords
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
    let score = 0;
    for (const kw of keywords) {
      if (haystack.includes(kw)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = dept;
    }
  }
  return best;
}
