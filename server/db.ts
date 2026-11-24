import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'campusdesk.db');
export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    keywords TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS sla_policies (
    priority TEXT PRIMARY KEY CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    response_hours INTEGER NOT NULL,
    resolution_hours INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('student', 'staff', 'admin')),
    department_id INTEGER NULL REFERENCES departments(id) ON DELETE SET NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_on_student', 'resolved', 'closed')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    assigned_to_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
    sla_due_at TEXT NOT NULL,
    resolved_at TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS ix_tickets_status_priority ON tickets(status, priority);
  CREATE INDEX IF NOT EXISTS ix_tickets_dept_status ON tickets(department_id, status);
  CREATE INDEX IF NOT EXISTS ix_tickets_student ON tickets(student_id);

  CREATE TABLE IF NOT EXISTS ticket_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    is_internal INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS ix_comments_ticket ON ticket_comments(ticket_id);

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    actor_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    old_value TEXT NULL,
    new_value TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS ix_audit_ticket ON audit_logs(ticket_id);
`);

export function seedDefaults(): void {
  const deptCountRow = db.prepare('SELECT COUNT(*) AS cnt FROM departments').get() as { cnt: number };
  if (deptCountRow.cnt === 0) {
    const insertDept = db.prepare(
      'INSERT INTO departments (name, description, keywords) VALUES (?, ?, ?)'
    );
    insertDept.run(
      'IT Support',
      'Campus Wi-Fi, LMS portal access, institutional email, and lab workstations',
      'wifi,wi-fi,internet,network,lms,portal,login,password,email,projector,lab,computer,software'
    );
    insertDept.run(
      'Hostel & Maintenance',
      'Dormitory room repairs, plumbing, electricity, AC, and mess facilities',
      'hostel,room,dorm,water,electricity,power,fan,ac,plumbing,mess,repair,furniture,lock'
    );
    insertDept.run(
      'Academic & Exams',
      'Transcripts, attendance corrections, course registration, and exam schedules',
      'exam,grade,transcript,attendance,registration,course,syllabus,hall ticket,marksheet,certificate'
    );
    insertDept.run(
      'Accounts & Fees',
      'Tuition receipts, scholarship disbursements, hostel dues, and refunds',
      'fee,payment,receipt,scholarship,refund,invoice,tuition,dues,finance,challan'
    );
  }

  const slaCountRow = db.prepare('SELECT COUNT(*) AS cnt FROM sla_policies').get() as { cnt: number };
  if (slaCountRow.cnt === 0) {
    const insertSla = db.prepare(
      'INSERT INTO sla_policies (priority, response_hours, resolution_hours) VALUES (?, ?, ?)'
    );
    insertSla.run('urgent', 1, 4);
    insertSla.run('high', 4, 24);
    insertSla.run('medium', 8, 48);
    insertSla.run('low', 24, 72);
  }
}

seedDefaults();
