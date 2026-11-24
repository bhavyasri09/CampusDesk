import express from 'express';
import type { Response } from 'express';
import { db } from './db.ts';
import {
  hashPassword,
  loadUserById,
  requireAuth,
  requireRole,
  signToken,
  verifyPassword,
  type AuthenticatedRequest,
  type UserRole,
} from './auth.ts';

export const apiRouter = express.Router();

type TicketStatus = 'open' | 'in_progress' | 'waiting_on_student' | 'resolved' | 'closed';
type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

const VALID_STATUSES: ReadonlySet<string> = new Set([
  'open',
  'in_progress',
  'waiting_on_student',
  'resolved',
  'closed',
]);

const VALID_PRIORITIES: ReadonlySet<string> = new Set(['low', 'medium', 'high', 'urgent']);

const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ['in_progress', 'waiting_on_student', 'resolved', 'closed'],
  in_progress: ['waiting_on_student', 'resolved', 'open', 'closed'],
  waiting_on_student: ['in_progress', 'resolved', 'closed', 'open'],
  resolved: ['closed', 'open'],
  closed: ['open'],
};

function parsePositiveInt(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const num = Number.parseInt(raw, 10);
  return Number.isSafeInteger(num) && num > 0 ? num : null;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 255;
}

function getSlaHours(priority: TicketPriority): number {
  const row = db
    .prepare('SELECT resolution_hours FROM sla_policies WHERE priority = ?')
    .get(priority) as { resolution_hours: number } | undefined;
  return row ? row.resolution_hours : 48;
}

function computeSlaDueIso(baseIso: string, priority: TicketPriority): string {
  const hours = getSlaHours(priority);
  const baseMs = Date.parse(baseIso);
  return new Date(baseMs + hours * 3600 * 1000).toISOString();
}

function detectDepartmentId(title: string, description: string): number {
  const haystack = `${title} ${description}`.toLowerCase();
  const depts = db
    .prepare('SELECT id, keywords FROM departments ORDER BY id ASC')
    .all() as Array<{ id: number; keywords: string }>;

  let bestId = depts[0]?.id ?? 1;
  let bestScore = 0;

  for (const dept of depts) {
    const terms = dept.keywords
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
    let score = 0;
    for (const term of terms) {
      if (haystack.includes(term)) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = dept.id;
    }
  }
  return bestId;
}

function generateTicketCode(): string {
  const row = db.prepare('SELECT COALESCE(MAX(id), 0) AS max_id FROM tickets').get() as {
    max_id: number;
  };
  return `TKT-${1001 + row.max_id}`;
}

function canAccessTicket(
  user: NonNullable<AuthenticatedRequest['user']>,
  ticket: { student_id: number; department_id: number; assigned_to_id: number | null }
): boolean {
  if (user.role === 'admin') return true;
  if (user.role === 'student') return ticket.student_id === user.id;
  return ticket.department_id === user.department_id || ticket.assigned_to_id === user.id;
}

function neutralizeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return `"${safe.replaceAll('"', '""')}"`;
}

apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

apiRouter.get('/auth/bootstrap-status', (_req, res) => {
  const row = db
    .prepare("SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'")
    .get() as { cnt: number };
  res.json({ needsBootstrap: row.cnt === 0 });
});

apiRouter.post('/auth/bootstrap', (req, res) => {
  const existingAdmin = db
    .prepare("SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'")
    .get() as { cnt: number };
  if (existingAdmin.cnt > 0) {
    res.status(409).json({ error: 'Workspace administrator has already been configured' });
    return;
  }

  const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const seedSampleData = req.body?.seed_sample_data !== false;

  if (fullName.length < 2 || fullName.length > 120) {
    res.status(400).json({ error: 'Full name must be between 2 and 120 characters' });
    return;
  }
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Valid email address is required' });
    return;
  }
  if (password.length < 8 || password.length > 128) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  const passwordHash = hashPassword(password);
  const insertUser = db.prepare(
    'INSERT INTO users (full_name, email, password_hash, role, department_id) VALUES (?, ?, ?, ?, ?)'
  );

  let adminId = 0;
  const demoAccounts: Array<{ full_name: string; email: string; role: UserRole; department?: string }> = [];

  db.exec('BEGIN IMMEDIATE');
  try {
    const adminRes = insertUser.run(fullName, email, passwordHash, 'admin', null);
    adminId = Number(adminRes.lastInsertRowid);

    if (seedSampleData) {
      const depts = db.prepare('SELECT id, name FROM departments').all() as Array<{
        id: number;
        name: string;
      }>;
      const deptByName = new Map(depts.map((d) => [d.name, d.id]));

      const itId = deptByName.get('IT Support') ?? 1;
      const hostelId = deptByName.get('Hostel & Maintenance') ?? 2;
      const academicId = deptByName.get('Academic & Exams') ?? 3;
      const accountsId = deptByName.get('Accounts & Fees') ?? 4;

      const sampleUsers: Array<{
        name: string;
        email: string;
        role: UserRole;
        deptId: number | null;
        deptName?: string;
      }> = [
        { name: 'Rohan Sharma', email: 'it.staff@campus.edu', role: 'staff', deptId: itId, deptName: 'IT Support' },
        { name: 'Meera Nair', email: 'hostel.staff@campus.edu', role: 'staff', deptId: hostelId, deptName: 'Hostel & Maintenance' },
        { name: 'Kavya Menon', email: 'exams.staff@campus.edu', role: 'staff', deptId: academicId, deptName: 'Academic & Exams' },
        { name: 'Ananya Verma', email: 'ananya.student@campus.edu', role: 'student', deptId: null },
        { name: 'Arjun Patel', email: 'arjun.student@campus.edu', role: 'student', deptId: null },
      ];

      const userIds = new Map<string, number>();
      for (const u of sampleUsers) {
        if (u.email !== email) {
          const r = insertUser.run(u.name, u.email, passwordHash, u.role, u.deptId);
          userIds.set(u.email, Number(r.lastInsertRowid));
          demoAccounts.push({
            full_name: u.name,
            email: u.email,
            role: u.role,
            department: u.deptName,
          });
        }
      }

      const itStaffId = userIds.get('it.staff@campus.edu') ?? adminId;
      const hostelStaffId = userIds.get('hostel.staff@campus.edu') ?? adminId;
      const examsStaffId = userIds.get('exams.staff@campus.edu') ?? adminId;
      const ananyaId = userIds.get('ananya.student@campus.edu') ?? adminId;
      const arjunId = userIds.get('arjun.student@campus.edu') ?? adminId;

      const now = Date.now();
      const hoursAgo = (h: number) => new Date(now - h * 3600 * 1000).toISOString();
      const hoursFromNow = (h: number) => new Date(now + h * 3600 * 1000).toISOString();

      const insertTicket = db.prepare(
        `INSERT INTO tickets
         (ticket_code, title, description, location, status, priority, student_id, department_id, assigned_to_id, sla_due_at, resolved_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const insertComment = db.prepare(
        'INSERT INTO ticket_comments (ticket_id, author_id, body, is_internal, created_at) VALUES (?, ?, ?, ?, ?)'
      );
      const insertAudit = db.prepare(
        'INSERT INTO audit_logs (ticket_id, actor_id, action, old_value, new_value, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      );

      const sampleTickets: Array<{
        code: string;
        title: string;
        desc: string;
        loc: string;
        status: TicketStatus;
        priority: TicketPriority;
        studentId: number;
        deptId: number;
        assignedId: number | null;
        slaDue: string;
        resolvedAt: string | null;
        createdAt: string;
        updatedAt: string;
        comments: Array<{ authorId: number; body: string; internal: number; at: string }>;
        audits: Array<{ actorId: number; action: string; oldVal: string | null; newVal: string | null; at: string }>;
      }> = [
        {
          code: 'TKT-1001',
          title: 'Campus Wi-Fi drops repeatedly in Block C Library',
          desc: 'Eduroam disconnects every 10 minutes on the 3rd floor reading wing. Multiple students on macOS and Windows are unable to maintain an active LMS session.',
          loc: 'Central Library · Floor 3',
          status: 'in_progress',
          priority: 'urgent',
          studentId: ananyaId,
          deptId: itId,
          assignedId: itStaffId,
          slaDue: hoursAgo(2),
          resolvedAt: null,
          createdAt: hoursAgo(6),
          updatedAt: hoursAgo(1),
          comments: [
            { authorId: itStaffId, body: 'Access point AP-LIB-3B showed high packet loss in controller telemetry. Dispatching a technician to replace the PoE injector.', internal: 1, at: hoursAgo(3) },
            { authorId: itStaffId, body: 'We have identified a faulty access point in the 3rd-floor reading wing and are replacing the hardware this afternoon.', internal: 0, at: hoursAgo(1) },
          ],
          audits: [
            { actorId: ananyaId, action: 'ticket_created', oldVal: null, newVal: 'open', at: hoursAgo(6) },
            { actorId: itStaffId, action: 'assignee_changed', oldVal: 'Unassigned', newVal: 'Rohan Sharma', at: hoursAgo(4) },
            { actorId: itStaffId, action: 'status_changed', oldVal: 'open', newVal: 'in_progress', at: hoursAgo(4) },
          ],
        },
        {
          code: 'TKT-1002',
          title: 'Water leakage from ceiling pipe in Hostel Room 214',
          desc: 'Continuous dripping near the study desk electrical outlet since last night. Needs urgent plumbing inspection before it damages power sockets.',
          loc: 'North Hostel · Room 214',
          status: 'open',
          priority: 'high',
          studentId: arjunId,
          deptId: hostelId,
          assignedId: null,
          slaDue: hoursFromNow(18),
          resolvedAt: null,
          createdAt: hoursAgo(6),
          updatedAt: hoursAgo(6),
          comments: [],
          audits: [
            { actorId: arjunId, action: 'ticket_created', oldVal: null, newVal: 'open', at: hoursAgo(6) },
          ],
        },
        {
          code: 'TKT-1003',
          title: 'LMS course enrollment missing for CS-402 Distributed Systems',
          desc: 'Registered during add/drop week and fee status is cleared, but CS-402 does not appear on my Moodle dashboard.',
          loc: 'Academic Portal',
          status: 'waiting_on_student',
          priority: 'medium',
          studentId: ananyaId,
          deptId: itId,
          assignedId: itStaffId,
          slaDue: hoursFromNow(22),
          resolvedAt: null,
          createdAt: hoursAgo(26),
          updatedAt: hoursAgo(5),
          comments: [
            { authorId: itStaffId, body: 'Synced SIS roster manually. Please log out, sign back into Moodle, and confirm if CS-402 is visible.', internal: 0, at: hoursAgo(5) },
          ],
          audits: [
            { actorId: ananyaId, action: 'ticket_created', oldVal: null, newVal: 'open', at: hoursAgo(26) },
            { actorId: itStaffId, action: 'status_changed', oldVal: 'open', newVal: 'in_progress', at: hoursAgo(20) },
            { actorId: itStaffId, action: 'status_changed', oldVal: 'in_progress', newVal: 'waiting_on_student', at: hoursAgo(5) },
          ],
        },
        {
          code: 'TKT-1004',
          title: 'Official semester 4 transcript stamp verification request',
          desc: 'Need an attested copy of my Semester 4 grade card for a summer research fellowship application deadline next Friday.',
          loc: 'Exam Cell Counter 2',
          status: 'resolved',
          priority: 'medium',
          studentId: arjunId,
          deptId: academicId,
          assignedId: examsStaffId,
          slaDue: hoursFromNow(10),
          resolvedAt: hoursAgo(4),
          createdAt: hoursAgo(38),
          updatedAt: hoursAgo(4),
          comments: [
            { authorId: examsStaffId, body: 'Signed and sealed transcript is ready for pickup at Exam Cell Counter 2 between 10:00 and 16:00.', internal: 0, at: hoursAgo(4) },
          ],
          audits: [
            { actorId: arjunId, action: 'ticket_created', oldVal: null, newVal: 'open', at: hoursAgo(38) },
            { actorId: examsStaffId, action: 'assignee_changed', oldVal: 'Unassigned', newVal: 'Kavya Menon', at: hoursAgo(30) },
            { actorId: examsStaffId, action: 'status_changed', oldVal: 'open', newVal: 'in_progress', at: hoursAgo(30) },
            { actorId: examsStaffId, action: 'status_changed', oldVal: 'in_progress', newVal: 'resolved', at: hoursAgo(4) },
          ],
        },
        {
          code: 'TKT-1005',
          title: 'Scholarship tuition fee receipt not reflecting in student ledger',
          desc: 'Merit scholarship credit of 25,000 was approved last week, but the online fee challan still shows full balance due.',
          loc: 'Finance Office',
          status: 'open',
          priority: 'high',
          studentId: ananyaId,
          deptId: accountsId,
          assignedId: null,
          slaDue: hoursFromNow(14),
          resolvedAt: null,
          createdAt: hoursAgo(10),
          updatedAt: hoursAgo(10),
          comments: [],
          audits: [
            { actorId: ananyaId, action: 'ticket_created', oldVal: null, newVal: 'open', at: hoursAgo(10) },
          ],
        },
        {
          code: 'TKT-1006',
          title: 'Broken study desk chair in Hostel Block B Room 108',
          desc: 'Backrest bolt sheared off. Requesting chair replacement from maintenance inventory.',
          loc: 'Block B Hostel · Room 108',
          status: 'closed',
          priority: 'low',
          studentId: ananyaId,
          deptId: hostelId,
          assignedId: hostelStaffId,
          slaDue: hoursAgo(12),
          resolvedAt: hoursAgo(42),
          createdAt: hoursAgo(84),
          updatedAt: hoursAgo(36),
          comments: [
            { authorId: hostelStaffId, body: 'Replaced chair from store inventory #44.', internal: 0, at: hoursAgo(42) },
            { authorId: ananyaId, body: 'Received the new chair, closing ticket. Thanks!', internal: 0, at: hoursAgo(36) },
          ],
          audits: [
            { actorId: ananyaId, action: 'ticket_created', oldVal: null, newVal: 'open', at: hoursAgo(84) },
            { actorId: hostelStaffId, action: 'status_changed', oldVal: 'open', newVal: 'resolved', at: hoursAgo(42) },
            { actorId: ananyaId, action: 'status_changed', oldVal: 'resolved', newVal: 'closed', at: hoursAgo(36) },
          ],
        },
        {
          code: 'TKT-1007',
          title: 'Lab 2 projector HDMI cable intermittent signal',
          desc: 'Projector loses signal whenever the podium cable is moved slightly during seminar presentations.',
          loc: 'Engineering Block · Lab 2',
          status: 'resolved',
          priority: 'medium',
          studentId: arjunId,
          deptId: itId,
          assignedId: itStaffId,
          slaDue: hoursAgo(20),
          resolvedAt: hoursAgo(54),
          createdAt: hoursAgo(72),
          updatedAt: hoursAgo(54),
          comments: [
            { authorId: itStaffId, body: 'Installed a new shielded 3m HDMI cable and secured strain relief at the podium.', internal: 0, at: hoursAgo(54) },
          ],
          audits: [
            { actorId: arjunId, action: 'ticket_created', oldVal: null, newVal: 'open', at: hoursAgo(72) },
            { actorId: itStaffId, action: 'status_changed', oldVal: 'open', newVal: 'resolved', at: hoursAgo(54) },
          ],
        },
      ];

      for (const t of sampleTickets) {
        const res = insertTicket.run(
          t.code,
          t.title,
          t.desc,
          t.loc,
          t.status,
          t.priority,
          t.studentId,
          t.deptId,
          t.assignedId,
          t.slaDue,
          t.resolvedAt,
          t.createdAt,
          t.updatedAt
        );
        const ticketId = Number(res.lastInsertRowid);
        for (const c of t.comments) {
          insertComment.run(ticketId, c.authorId, c.body, c.internal, c.at);
        }
        for (const a of t.audits) {
          insertAudit.run(ticketId, a.actorId, a.action, a.oldVal, a.newVal, a.at);
        }
      }
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Bootstrap error:', err);
    res.status(500).json({ error: 'Failed to initialize workspace' });
    return;
  }

  const user = loadUserById(adminId);
  if (!user) {
    res.status(500).json({ error: 'Failed to load created administrator' });
    return;
  }

  const token = signToken(user.id, user.role);
  res.status(201).json({ token, user, demoAccounts });
});

apiRouter.post('/auth/register', (req, res) => {
  const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (fullName.length < 2 || fullName.length > 120) {
    res.status(400).json({ error: 'Full name must be between 2 and 120 characters' });
    return;
  }
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Valid email address is required' });
    return;
  }
  if (password.length < 8 || password.length > 128) {
    res.status(400).json({ error: 'Password must be between 8 and 128 characters' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists' });
    return;
  }

  const passwordHash = hashPassword(password);
  const result = db
    .prepare(
      "INSERT INTO users (full_name, email, password_hash, role, department_id) VALUES (?, ?, ?, 'student', NULL)"
    )
    .run(fullName, email, passwordHash);

  const user = loadUserById(Number(result.lastInsertRowid));
  if (!user) {
    res.status(500).json({ error: 'Unable to load newly registered user' });
    return;
  }

  const token = signToken(user.id, user.role);
  res.status(201).json({ token, user });
});

apiRouter.post('/auth/login', (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const row = db
    .prepare('SELECT id, password_hash, is_active FROM users WHERE email = ?')
    .get(email) as { id: number; password_hash: string; is_active: number } | undefined;

  if (!row || !verifyPassword(password, row.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  if (row.is_active !== 1) {
    res.status(403).json({ error: 'Account has been deactivated by an administrator' });
    return;
  }

  const user = loadUserById(row.id);
  if (!user) {
    res.status(401).json({ error: 'User profile not found' });
    return;
  }

  const token = signToken(user.id, user.role);
  res.json({ token, user });
});

apiRouter.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

apiRouter.get('/departments', requireAuth, (_req, res) => {
  const departments = db
    .prepare(
      `SELECT d.id, d.name, d.description, d.keywords, d.created_at,
              (SELECT COUNT(*) FROM tickets t WHERE t.department_id = d.id AND t.status NOT IN ('resolved', 'closed')) AS active_ticket_count,
              (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.role = 'staff' AND u.is_active = 1) AS staff_count
       FROM departments d
       ORDER BY d.id ASC`
    )
    .all();

  res.json({ departments });
});

apiRouter.post('/departments', requireAuth, requireRole('admin'), (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  const keywords = typeof req.body?.keywords === 'string' ? req.body.keywords.trim() : '';

  if (name.length < 2 || name.length > 80) {
    res.status(400).json({ error: 'Department name must be between 2 and 80 characters' });
    return;
  }

  const existing = db.prepare('SELECT id FROM departments WHERE LOWER(name) = LOWER(?)').get(name);
  if (existing) {
    res.status(409).json({ error: 'A department with this name already exists' });
    return;
  }

  const result = db
    .prepare('INSERT INTO departments (name, description, keywords) VALUES (?, ?, ?)')
    .run(name, description, keywords);

  const dept = db
    .prepare('SELECT id, name, description, keywords, created_at FROM departments WHERE id = ?')
    .get(Number(result.lastInsertRowid));
  res.status(201).json({ department: dept });
});

apiRouter.get('/sla-policies', requireAuth, (_req, res) => {
  const policies = db
    .prepare(
      `SELECT priority, response_hours, resolution_hours, updated_at
       FROM sla_policies
       ORDER BY CASE priority
         WHEN 'urgent' THEN 1
         WHEN 'high' THEN 2
         WHEN 'medium' THEN 3
         WHEN 'low' THEN 4
       END`
    )
    .all();
  res.json({ policies });
});

apiRouter.patch('/sla-policies/:priority', requireAuth, requireRole('admin'), (req, res) => {
  const priority = req.params.priority;
  if (!VALID_PRIORITIES.has(priority)) {
    res.status(400).json({ error: 'Invalid priority tier' });
    return;
  }

  const responseHours = Number(req.body?.response_hours);
  const resolutionHours = Number(req.body?.resolution_hours);

  if (
    !Number.isInteger(responseHours) ||
    !Number.isInteger(resolutionHours) ||
    responseHours < 1 ||
    resolutionHours < responseHours ||
    resolutionHours > 720
  ) {
    res.status(400).json({
      error: 'Response and resolution hours must be integers with resolution >= response (max 720h)',
    });
    return;
  }

  db.prepare(
    `UPDATE sla_policies
     SET response_hours = ?, resolution_hours = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE priority = ?`
  ).run(responseHours, resolutionHours, priority);

  const updated = db.prepare('SELECT * FROM sla_policies WHERE priority = ?').get(priority);
  res.json({ policy: updated });
});

apiRouter.get('/users', requireAuth, requireRole('admin', 'staff'), (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  if (user.role === 'staff') {
    const staffRows = db
      .prepare(
        `SELECT u.id, u.full_name, u.email, u.role, u.department_id, d.name AS department_name, u.is_active
         FROM users u
         LEFT JOIN departments d ON d.id = u.department_id
         WHERE u.role IN ('staff', 'admin') AND u.is_active = 1
         ORDER BY u.full_name ASC`
      )
      .all();
    res.json({ users: staffRows });
    return;
  }

  const users = db
    .prepare(
      `SELECT u.id, u.full_name, u.email, u.role, u.department_id, d.name AS department_name, u.is_active, u.created_at
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       ORDER BY u.created_at DESC`
    )
    .all();
  res.json({ users });
});

apiRouter.post('/users', requireAuth, requireRole('admin'), (req, res) => {
  const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const role = req.body?.role as UserRole;
  const deptId = req.body?.department_id ? Number(req.body.department_id) : null;

  if (fullName.length < 2 || fullName.length > 120) {
    res.status(400).json({ error: 'Full name must be between 2 and 120 characters' });
    return;
  }
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Valid email address is required' });
    return;
  }
  if (password.length < 8 || password.length > 128) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }
  if (!['student', 'staff', 'admin'].includes(role)) {
    res.status(400).json({ error: 'Invalid role' });
    return;
  }
  if (role === 'staff' && (!deptId || !db.prepare('SELECT id FROM departments WHERE id = ?').get(deptId))) {
    res.status(400).json({ error: 'Staff accounts must be assigned to a valid department' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    res.status(409).json({ error: 'Email is already registered' });
    return;
  }

  const passwordHash = hashPassword(password);
  const resInsert = db
    .prepare('INSERT INTO users (full_name, email, password_hash, role, department_id) VALUES (?, ?, ?, ?, ?)')
    .run(fullName, email, passwordHash, role, role === 'staff' ? deptId : null);

  const created = loadUserById(Number(resInsert.lastInsertRowid));
  res.status(201).json({ user: created });
});

apiRouter.patch('/users/:id', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res) => {
  const targetId = parsePositiveInt(req.params.id);
  if (!targetId) {
    res.status(400).json({ error: 'Invalid user ID' });
    return;
  }

  const existing = loadUserById(targetId);
  if (!existing) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const nextRole = (req.body?.role ?? existing.role) as UserRole;
  const nextDeptId =
    req.body?.department_id !== undefined
      ? req.body.department_id === null
        ? null
        : Number(req.body.department_id)
      : existing.department_id;
  const nextActive =
    typeof req.body?.is_active === 'boolean' ? (req.body.is_active ? 1 : 0) : existing.is_active;

  if (!['student', 'staff', 'admin'].includes(nextRole)) {
    res.status(400).json({ error: 'Invalid role' });
    return;
  }

  if (targetId === req.user!.id && nextActive === 0) {
    res.status(400).json({ error: 'You cannot deactivate your own active administrator account' });
    return;
  }

  db.prepare('UPDATE users SET role = ?, department_id = ?, is_active = ? WHERE id = ?').run(
    nextRole,
    nextRole === 'staff' ? nextDeptId : null,
    nextActive,
    targetId
  );

  const updated = loadUserById(targetId);
  res.json({ user: updated });
});

function buildTicketQuery(
  user: NonNullable<AuthenticatedRequest['user']>,
  query: Record<string, unknown>
): { sql: string; params: Array<string | number> } {
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (user.role === 'student') {
    conditions.push('t.student_id = ?');
    params.push(user.id);
  } else if (user.role === 'staff') {
    conditions.push('(t.department_id = ? OR t.assigned_to_id = ?)');
    params.push(user.department_id ?? -1, user.id);
  }

  const status = typeof query.status === 'string' ? query.status : '';
  if (status && VALID_STATUSES.has(status)) {
    conditions.push('t.status = ?');
    params.push(status);
  }

  const priority = typeof query.priority === 'string' ? query.priority : '';
  if (priority && VALID_PRIORITIES.has(priority)) {
    conditions.push('t.priority = ?');
    params.push(priority);
  }

  const deptRaw = typeof query.department_id === 'string' ? query.department_id : '';
  const deptId = parsePositiveInt(deptRaw);
  if (deptId) {
    conditions.push('t.department_id = ?');
    params.push(deptId);
  }

  if (query.overdue === 'true') {
    conditions.push("t.status NOT IN ('resolved', 'closed')");
    conditions.push("t.sla_due_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
  }

  if (query.assigned === 'me') {
    conditions.push('t.assigned_to_id = ?');
    params.push(user.id);
  } else if (query.assigned === 'unassigned') {
    conditions.push('t.assigned_to_id IS NULL');
  }

  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search) {
    const pattern = `%${search}%`;
    conditions.push('(t.ticket_code LIKE ? OR t.title LIKE ? OR t.description LIKE ? OR s.full_name LIKE ?)');
    params.push(pattern, pattern, pattern, pattern);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT t.id, t.ticket_code, t.title, t.description, t.location, t.status, t.priority,
           t.student_id, s.full_name AS student_name, s.email AS student_email,
           t.department_id, d.name AS department_name,
           t.assigned_to_id, a.full_name AS assigned_to_name,
           t.sla_due_at, t.resolved_at, t.created_at, t.updated_at,
           (SELECT COUNT(*) FROM ticket_comments c
            WHERE c.ticket_id = t.id ${user.role === 'student' ? 'AND c.is_internal = 0' : ''}) AS comment_count
    FROM tickets t
    JOIN users s ON s.id = t.student_id
    JOIN departments d ON d.id = t.department_id
    LEFT JOIN users a ON a.id = t.assigned_to_id
    ${whereClause}
    ORDER BY
      CASE WHEN t.status NOT IN ('resolved', 'closed') AND t.sla_due_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now') THEN 0 ELSE 1 END ASC,
      t.updated_at DESC
  `;

  return { sql, params };
}

apiRouter.get('/tickets/export/csv', requireAuth, requireRole('admin', 'staff'), (req: AuthenticatedRequest, res) => {
  const { sql, params } = buildTicketQuery(req.user!, req.query as Record<string, unknown>);
  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

  const headers = [
    'Ticket Code',
    'Title',
    'Status',
    'Priority',
    'Department',
    'Requester',
    'Assignee',
    'Location',
    'SLA Due At',
    'Created At',
    'Resolved At',
  ];

  const lines = [headers.map(neutralizeCsvCell).join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.ticket_code,
        r.title,
        r.status,
        r.priority,
        r.department_name,
        r.student_name,
        r.assigned_to_name ?? 'Unassigned',
        r.location,
        r.sla_due_at,
        r.created_at,
        r.resolved_at ?? '',
      ]
        .map(neutralizeCsvCell)
        .join(',')
    );
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="campusdesk-tickets.csv"');
  res.send(lines.join('\r\n'));
});

apiRouter.get('/tickets', requireAuth, (req: AuthenticatedRequest, res) => {
  const { sql, params } = buildTicketQuery(req.user!, req.query as Record<string, unknown>);
  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  const nowMs = Date.now();
  const tickets = rows.map((row) => ({
    ...row,
    is_overdue:
      row.status !== 'resolved' &&
      row.status !== 'closed' &&
      Date.parse(String(row.sla_due_at)) < nowMs,
  }));
  res.json({ tickets });
});

apiRouter.post('/tickets', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  const location = typeof req.body?.location === 'string' ? req.body.location.trim() : '';
  const priority = (req.body?.priority ?? 'medium') as TicketPriority;
  const requestedDeptId = req.body?.department_id ? Number(req.body.department_id) : null;

  if (title.length < 5 || title.length > 200) {
    res.status(400).json({ error: 'Title must be between 5 and 200 characters' });
    return;
  }
  if (description.length < 10 || description.length > 4000) {
    res.status(400).json({ error: 'Description must be between 10 and 4000 characters' });
    return;
  }
  if (!VALID_PRIORITIES.has(priority)) {
    res.status(400).json({ error: 'Invalid priority level' });
    return;
  }

  let departmentId: number;
  let autoRouted = false;
  if (requestedDeptId) {
    const dept = db.prepare('SELECT id FROM departments WHERE id = ?').get(requestedDeptId) as
      | { id: number }
      | undefined;
    if (!dept) {
      res.status(400).json({ error: 'Selected department does not exist' });
      return;
    }
    departmentId = dept.id;
  } else {
    departmentId = detectDepartmentId(title, description);
    autoRouted = true;
  }

  const nowIso = new Date().toISOString();
  const slaDueAt = computeSlaDueIso(nowIso, priority);
  const ticketCode = generateTicketCode();

  let newTicketId = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    const insertRes = db
      .prepare(
        `INSERT INTO tickets
         (ticket_code, title, description, location, status, priority, student_id, department_id, sla_due_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)`
      )
      .run(
        ticketCode,
        title,
        description,
        location,
        priority,
        user.id,
        departmentId,
        slaDueAt,
        nowIso,
        nowIso
      );
    newTicketId = Number(insertRes.lastInsertRowid);

    db.prepare(
      'INSERT INTO audit_logs (ticket_id, actor_id, action, old_value, new_value, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      newTicketId,
      user.id,
      autoRouted ? 'ticket_created_auto_routed' : 'ticket_created',
      null,
      'open',
      nowIso
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Create ticket error:', err);
    res.status(500).json({ error: 'Failed to create ticket' });
    return;
  }

  const created = db
    .prepare(
      `SELECT t.*, s.full_name AS student_name, s.email AS student_email,
              d.name AS department_name, a.full_name AS assigned_to_name
       FROM tickets t
       JOIN users s ON s.id = t.student_id
       JOIN departments d ON d.id = t.department_id
       LEFT JOIN users a ON a.id = t.assigned_to_id
       WHERE t.id = ?`
    )
    .get(newTicketId) as Record<string, unknown>;

  res.status(201).json({ ticket: { ...created, is_overdue: false, comment_count: 0 } });
});

function fetchTicketDetailResponse(
  ticketId: number,
  user: NonNullable<AuthenticatedRequest['user']>,
  res: Response
): void {
  const ticket = db
    .prepare(
      `SELECT t.*, s.full_name AS student_name, s.email AS student_email,
              d.name AS department_name, a.full_name AS assigned_to_name
       FROM tickets t
       JOIN users s ON s.id = t.student_id
       JOIN departments d ON d.id = t.department_id
       LEFT JOIN users a ON a.id = t.assigned_to_id
       WHERE t.id = ?`
    )
    .get(ticketId) as
    | (Record<string, unknown> & {
        student_id: number;
        department_id: number;
        assigned_to_id: number | null;
        status: TicketStatus;
        sla_due_at: string;
      })
    | undefined;

  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }

  if (!canAccessTicket(user, ticket)) {
    res.status(403).json({ error: 'You do not have permission to view this ticket' });
    return;
  }

  const commentsSql = `
    SELECT c.id, c.ticket_id, c.author_id, u.full_name AS author_name, u.role AS author_role,
           c.body, c.is_internal, c.created_at
    FROM ticket_comments c
    JOIN users u ON u.id = c.author_id
    WHERE c.ticket_id = ? ${user.role === 'student' ? 'AND c.is_internal = 0' : ''}
    ORDER BY c.created_at ASC
  `;
  const comments = db.prepare(commentsSql).all(ticketId);

  const auditLogs = db
    .prepare(
      `SELECT l.id, l.ticket_id, l.actor_id, u.full_name AS actor_name, u.role AS actor_role,
              l.action, l.old_value, l.new_value, l.created_at
       FROM audit_logs l
       LEFT JOIN users u ON u.id = l.actor_id
       WHERE l.ticket_id = ?
       ORDER BY l.created_at ASC`
    )
    .all(ticketId);

  const isOverdue =
    ticket.status !== 'resolved' &&
    ticket.status !== 'closed' &&
    Date.parse(ticket.sla_due_at) < Date.now();

  res.json({
    ticket: { ...ticket, is_overdue: isOverdue },
    comments,
    audit_logs: auditLogs,
  });
}

apiRouter.get('/tickets/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const ticketId = parsePositiveInt(req.params.id);
  if (!ticketId) {
    res.status(400).json({ error: 'Invalid ticket ID' });
    return;
  }
  fetchTicketDetailResponse(ticketId, req.user!, res);
});

apiRouter.patch('/tickets/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const ticketId = parsePositiveInt(req.params.id);
  if (!ticketId) {
    res.status(400).json({ error: 'Invalid ticket ID' });
    return;
  }

  const user = req.user!;
  const existing = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId) as
    | {
        id: number;
        status: TicketStatus;
        priority: TicketPriority;
        student_id: number;
        department_id: number;
        assigned_to_id: number | null;
        created_at: string;
        resolved_at: string | null;
      }
    | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }

  if (!canAccessTicket(user, existing)) {
    res.status(403).json({ error: 'You do not have permission to update this ticket' });
    return;
  }

  const nowIso = new Date().toISOString();
  const nextStatus = req.body?.status as TicketStatus | undefined;
  const nextPriority = req.body?.priority as TicketPriority | undefined;
  const nextDepartmentId =
    req.body?.department_id !== undefined ? Number(req.body.department_id) : undefined;
  const nextAssignedToId =
    req.body?.assigned_to_id !== undefined
      ? req.body.assigned_to_id === null
        ? null
        : Number(req.body.assigned_to_id)
      : undefined;

  if (user.role === 'student') {
    if (
      nextPriority !== undefined ||
      nextDepartmentId !== undefined ||
      nextAssignedToId !== undefined
    ) {
      res.status(403).json({ error: 'Students cannot modify priority, department, or assignee' });
      return;
    }
    if (!nextStatus) {
      res.status(400).json({ error: 'No valid update fields provided' });
      return;
    }
    if (existing.status !== 'resolved' || (nextStatus !== 'closed' && nextStatus !== 'open')) {
      res.status(400).json({
        error: 'Students can only reopen or confirm closure on a resolved ticket',
      });
      return;
    }
  }

  let finalStatus = existing.status;
  let finalResolvedAt = existing.resolved_at;
  let finalPriority = existing.priority;
  let finalSlaDueAt: string | undefined;
  let finalDepartmentId = existing.department_id;
  let finalAssignedToId = existing.assigned_to_id;

  const auditEntries: Array<{ action: string; oldVal: string | null; newVal: string | null }> = [];

  if (nextStatus !== undefined && nextStatus !== existing.status) {
    if (!VALID_STATUSES.has(nextStatus)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }
    const allowed = ALLOWED_TRANSITIONS[existing.status];
    if (!allowed.includes(nextStatus)) {
      res.status(400).json({
        error: `Cannot transition ticket from ${existing.status} to ${nextStatus}`,
      });
      return;
    }
    finalStatus = nextStatus;
    if (nextStatus === 'resolved') {
      finalResolvedAt = nowIso;
    } else if (nextStatus === 'open') {
      finalResolvedAt = null;
    }
    auditEntries.push({
      action: 'status_changed',
      oldVal: existing.status,
      newVal: nextStatus,
    });
  }

  if (nextPriority !== undefined && nextPriority !== existing.priority) {
    if (!VALID_PRIORITIES.has(nextPriority)) {
      res.status(400).json({ error: 'Invalid priority' });
      return;
    }
    finalPriority = nextPriority;
    finalSlaDueAt = computeSlaDueIso(existing.created_at, nextPriority);
    auditEntries.push({
      action: 'priority_changed',
      oldVal: existing.priority,
      newVal: nextPriority,
    });
  }

  if (nextDepartmentId !== undefined && nextDepartmentId !== existing.department_id) {
    if (user.role !== 'admin') {
      res.status(403).json({ error: 'Only administrators can transfer tickets across departments' });
      return;
    }
    const oldDept = db.prepare('SELECT name FROM departments WHERE id = ?').get(existing.department_id) as
      | { name: string }
      | undefined;
    const newDept = db.prepare('SELECT id, name FROM departments WHERE id = ?').get(nextDepartmentId) as
      | { id: number; name: string }
      | undefined;
    if (!newDept) {
      res.status(400).json({ error: 'Target department not found' });
      return;
    }
    finalDepartmentId = newDept.id;
    auditEntries.push({
      action: 'department_changed',
      oldVal: oldDept?.name ?? String(existing.department_id),
      newVal: newDept.name,
    });
  }

  if (nextAssignedToId !== undefined && nextAssignedToId !== existing.assigned_to_id) {
    let newAssigneeName = 'Unassigned';
    if (nextAssignedToId !== null) {
      const targetStaff = db
        .prepare("SELECT id, full_name, role, department_id FROM users WHERE id = ? AND is_active = 1")
        .get(nextAssignedToId) as
        | { id: number; full_name: string; role: UserRole; department_id: number | null }
        | undefined;
      if (!targetStaff || targetStaff.role === 'student') {
        res.status(400).json({ error: 'Assignee must be an active staff or admin account' });
        return;
      }
      if (user.role === 'staff' && targetStaff.id !== user.id && targetStaff.department_id !== user.department_id) {
        res.status(403).json({ error: 'Staff can only assign tickets within their own department' });
        return;
      }
      newAssigneeName = targetStaff.full_name;
    }

    const oldAssignee = existing.assigned_to_id
      ? (db.prepare('SELECT full_name FROM users WHERE id = ?').get(existing.assigned_to_id) as
          | { full_name: string }
          | undefined)?.full_name ?? 'Unknown'
      : 'Unassigned';

    finalAssignedToId = nextAssignedToId;
    auditEntries.push({
      action: 'assignee_changed',
      oldVal: oldAssignee,
      newVal: newAssigneeName,
    });
  }

  if (auditEntries.length === 0) {
    fetchTicketDetailResponse(ticketId, user, res);
    return;
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      `UPDATE tickets
       SET status = ?, priority = ?, department_id = ?, assigned_to_id = ?,
           sla_due_at = COALESCE(?, sla_due_at), resolved_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      finalStatus,
      finalPriority,
      finalDepartmentId,
      finalAssignedToId,
      finalSlaDueAt ?? null,
      finalResolvedAt,
      nowIso,
      ticketId
    );

    const insertAudit = db.prepare(
      'INSERT INTO audit_logs (ticket_id, actor_id, action, old_value, new_value, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const entry of auditEntries) {
      insertAudit.run(ticketId, user.id, entry.action, entry.oldVal, entry.newVal, nowIso);
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Update ticket error:', err);
    res.status(500).json({ error: 'Failed to update ticket' });
    return;
  }

  fetchTicketDetailResponse(ticketId, user, res);
});

apiRouter.post('/tickets/:id/comments', requireAuth, (req: AuthenticatedRequest, res) => {
  const ticketId = parsePositiveInt(req.params.id);
  if (!ticketId) {
    res.status(400).json({ error: 'Invalid ticket ID' });
    return;
  }

  const user = req.user!;
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  const requestedInternal = Boolean(req.body?.is_internal);

  if (body.length < 1 || body.length > 3000) {
    res.status(400).json({ error: 'Reply must be between 1 and 3000 characters' });
    return;
  }

  const ticket = db
    .prepare('SELECT id, student_id, department_id, assigned_to_id FROM tickets WHERE id = ?')
    .get(ticketId) as
    | { id: number; student_id: number; department_id: number; assigned_to_id: number | null }
    | undefined;

  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }

  if (!canAccessTicket(user, ticket)) {
    res.status(403).json({ error: 'You do not have permission to comment on this ticket' });
    return;
  }

  const isInternal = user.role === 'student' ? 0 : requestedInternal ? 1 : 0;
  const nowIso = new Date().toISOString();

  db.exec('BEGIN IMMEDIATE');
  try {
    const insertRes = db
      .prepare(
        'INSERT INTO ticket_comments (ticket_id, author_id, body, is_internal, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(ticketId, user.id, body, isInternal, nowIso);
    db.prepare('UPDATE tickets SET updated_at = ? WHERE id = ?').run(nowIso, ticketId);
    db.exec('COMMIT');

    const comment = db
      .prepare(
        `SELECT c.id, c.ticket_id, c.author_id, u.full_name AS author_name, u.role AS author_role,
                c.body, c.is_internal, c.created_at
         FROM ticket_comments c
         JOIN users u ON u.id = c.author_id
         WHERE c.id = ?`
      )
      .get(Number(insertRes.lastInsertRowid));

    res.status(201).json({ comment });
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Add comment error:', err);
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

apiRouter.get('/analytics', requireAuth, requireRole('admin', 'staff'), (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const isStaff = user.role === 'staff';
  const scopeClause = isStaff ? 'WHERE t.department_id = ?' : '';
  const scopeParams = isStaff ? [user.department_id ?? -1] : [];

  const tickets = db
    .prepare(
      `SELECT t.id, t.status, t.priority, t.department_id, d.name AS department_name,
              t.sla_due_at, t.resolved_at, t.created_at
       FROM tickets t
       JOIN departments d ON d.id = t.department_id
       ${scopeClause}`
    )
    .all(...scopeParams) as Array<{
    id: number;
    status: TicketStatus;
    priority: TicketPriority;
    department_id: number;
    department_name: string;
    sla_due_at: string;
    resolved_at: string | null;
    created_at: string;
  }>;

  const nowMs = Date.now();
  let openQueue = 0;
  let resolvedCount = 0;
  let overdueActive = 0;
  let slaCompliantResolved = 0;
  let totalResolutionHours = 0;
  let resolutionSamples = 0;

  const byStatus: Record<TicketStatus, number> = {
    open: 0,
    in_progress: 0,
    waiting_on_student: 0,
    resolved: 0,
    closed: 0,
  };

  const byPriority: Record<TicketPriority, number> = {
    urgent: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  const deptMap = new Map<
    string,
    { department_id: number; department_name: string; total: number; active: number; resolved: number; overdue: number }
  >();

  for (const t of tickets) {
    byStatus[t.status] += 1;
    byPriority[t.priority] += 1;

    const isDone = t.status === 'resolved' || t.status === 'closed';
    const dueMs = Date.parse(t.sla_due_at);
    const isOverdue = !isDone && dueMs < nowMs;

    if (isDone) {
      resolvedCount += 1;
      const doneMs = t.resolved_at ? Date.parse(t.resolved_at) : Date.parse(t.created_at);
      if (doneMs <= dueMs) {
        slaCompliantResolved += 1;
      }
      if (t.resolved_at) {
        const diffHours = Math.max(0.1, (Date.parse(t.resolved_at) - Date.parse(t.created_at)) / 3600000);
        totalResolutionHours += diffHours;
        resolutionSamples += 1;
      }
    } else {
      openQueue += 1;
      if (isOverdue) overdueActive += 1;
    }

    const existingDept = deptMap.get(t.department_name) ?? {
      department_id: t.department_id,
      department_name: t.department_name,
      total: 0,
      active: 0,
      resolved: 0,
      overdue: 0,
    };
    existingDept.total += 1;
    if (isDone) existingDept.resolved += 1;
    else existingDept.active += 1;
    if (isOverdue) existingDept.overdue += 1;
    deptMap.set(t.department_name, existingDept);
  }

  const slaComplianceRate =
    resolvedCount + overdueActive > 0
      ? Math.round((slaCompliantResolved / (resolvedCount + overdueActive)) * 100)
      : 100;

  const avgResolutionHours =
    resolutionSamples > 0 ? Number((totalResolutionHours / resolutionSamples).toFixed(1)) : 0;

  res.json({
    summary: {
      total_tickets: tickets.length,
      open_queue: openQueue,
      resolved_tickets: resolvedCount,
      overdue_active: overdueActive,
      sla_compliance_rate: slaComplianceRate,
      avg_resolution_hours: avgResolutionHours,
    },
    by_status: byStatus,
    by_priority: byPriority,
    by_department: Array.from(deptMap.values()).sort((a, b) => b.total - a.total),
  });
});
