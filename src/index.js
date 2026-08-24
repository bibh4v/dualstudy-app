import express from 'express';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import Database from 'sqlite3';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { ensureSchema } from './schema.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = process.env.PORT || 3000;
const dataDir = join(process.cwd(), 'data');
const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

// Open DB + create tables (idempotent)
mkdirSync(dataDir, { recursive: true });
const db = new Database.Database(join(dataDir, 'planner.db'));
await ensureSchema(db);

// Promisified helpers
const run = (sql, ...params) => new Promise((res, rej) =>
  db.run(sql, params, function (err) { err ? rej(err) : res({ lastID: this.lastID, changes: this.changes }); }));
const get = (sql, ...params) => new Promise((res, rej) =>
  db.get(sql, params, (err, row) => err ? rej(err) : res(row)));
const all = (sql, ...params) => new Promise((res, rej) =>
  db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));

// Serve static frontend
app.use(express.static(join(__dirname, '..', 'public')));

// ===== AUTH MIDDLEWARE =====
async function requireAuth(req, res, next) {
  try {
    const sessionId = req.cookies.session_id;
    if (!sessionId) return res.status(401).json({ error: 'Not authenticated' });

    const sess = await get('SELECT * FROM sessions WHERE id = ? AND expires_at > ?', sessionId, Date.now());
    if (!sess) return res.status(401).json({ error: 'Session expired' });

    const user = await get('SELECT id, email FROM users WHERE id = ?', sess.user_id);
    if (!user) return res.status(401).json({ error: 'User not found' });

    req.user = user;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Auth check failed' });
  }
}

function setSessionCookie(res, sessionId) {
  res.cookie('session_id', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION
  });
}

// ===== AUTH ROUTES =====
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const existing = await get('SELECT id FROM users WHERE email = ?', email.toLowerCase());
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const userId = uuidv4();
    const hash = await bcrypt.hash(password, 10);
    await run('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
      userId, email.toLowerCase(), hash, Date.now());

    const sessionId = uuidv4();
    await run('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)',
      sessionId, userId, Date.now() + SESSION_DURATION);
    setSessionCookie(res, sessionId);

    res.json({ userId, email: email.toLowerCase() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await get('SELECT * FROM users WHERE email = ?', email.toLowerCase());
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const sessionId = uuidv4();
    await run('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)',
      sessionId, user.id, Date.now() + SESSION_DURATION);
    setSessionCookie(res, sessionId);

    res.json({ userId: user.id, email: user.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    const sessionId = req.cookies.session_id;
    if (sessionId) await run('DELETE FROM sessions WHERE id = ?', sessionId);
    res.clearCookie('session_id');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Logout failed' });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ userId: req.user.id, email: req.user.email });
});

// ===== DATA ROUTES =====

// Get full planner state
app.get('/api/state', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const state = await get('SELECT * FROM planner_state WHERE user_id = ?', userId);
    const slots = await all('SELECT * FROM slots WHERE user_id = ? ORDER BY created_at', userId);
    const mscSubjects = await all('SELECT * FROM msc_subjects WHERE user_id = ? ORDER BY created_at', userId);
    const neaTech = await all('SELECT * FROM nea_tech WHERE user_id = ? ORDER BY created_at', userId);
    const neaNonTech = await all('SELECT * FROM nea_nontech WHERE user_id = ? ORDER BY created_at', userId);
    const notes = await all('SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC', userId);
    const tasks = await all('SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at', userId);
    const goals = await all('SELECT * FROM goals WHERE user_id = ? ORDER BY created_at', userId);

    // Subtopics joined per parent (scoped to this user's parents)
    const mscSubtopics = await all(`
      SELECT st.* FROM msc_subtopics st
      JOIN msc_subjects s ON s.id = st.subject_id
      WHERE s.user_id = ?`, userId);
    const neaTechSubtopics = await all(`
      SELECT st.* FROM nea_tech_subtopics st
      JOIN nea_tech t ON t.id = st.topic_id
      WHERE t.user_id = ?`, userId);
    const neaNonTechSubtopics = await all(`
      SELECT st.* FROM nea_nontech_subtopics st
      JOIN nea_nontech t ON t.id = st.topic_id
      WHERE t.user_id = ?`, userId);
    const taskSubtopics = await all(`
      SELECT st.* FROM task_subtopics st
      JOIN tasks t ON t.id = st.task_id
      WHERE t.user_id = ?`, userId);

    const response = {
      dayEnd: state?.day_end || '22:00',
      neaFixed: state?.nea_fixed || 120,
      neaStart: state?.nea_start || '20:00',
      focusMin: state?.focus_min || 0,
      focusDate: state?.focus_date || '',
      slots: slots.map(s => ({ id: s.id, label: s.label, type: s.type, start: s.start, dur: +s.dur })),
      mscSubjects: mscSubjects.map(s => ({
        id: s.id, name: s.name, pct: s.pct,
        file: s.file_data ? { data: s.file_data, name: s.file_name, type: s.file_type } : null,
        subtopics: mscSubtopics.filter(st => st.subject_id === s.id).map(st => ({
          id: st.id, name: st.name, total: st.total, done: st.done
        }))
      })),
      neaTech: neaTech.map(s => ({
        id: s.id, name: s.name, pct: s.pct,
        file: s.file_data ? { data: s.file_data, name: s.file_name, type: s.file_type } : null,
        subtopics: neaTechSubtopics.filter(st => st.topic_id === s.id).map(st => ({
          id: st.id, name: st.name, total: st.total, done: st.done
        }))
      })),
      neaNonTech: neaNonTech.map(s => ({
        id: s.id, name: s.name, pct: s.pct,
        file: s.file_data ? { data: s.file_data, name: s.file_name, type: s.file_type } : null,
        subtopics: neaNonTechSubtopics.filter(st => st.topic_id === s.id).map(st => ({
          id: st.id, name: st.name, total: st.total, done: st.done
        }))
      })),
      notes: notes.map(n => ({
        id: n.id, title: n.title, cat: n.cat, body: n.body, date: n.date,
        file: n.file_data ? { data: n.file_data, name: n.file_name, type: n.file_type } : null
      })),
      tasks: tasks.map(t => ({
        id: t.id, name: t.name, track: t.track, dead: t.dead, window: t.window || '',
        status: t.status, total: t.total, done: t.done,
        subtopics: taskSubtopics.filter(st => st.task_id === t.id).map(st => ({
          id: st.id, name: st.name, total: st.total, done: st.done
        }))
      })),
      goals: goals.map(g => ({
        id: g.id, title: g.title, desc: g.desc || '', track: g.track, pct: g.pct
      }))
    };

    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load state' });
  }
});

// Save full state (bulk replace in a transaction)
app.put('/api/state', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const data = req.body;
  const now = Date.now();

  try {
    await run('BEGIN TRANSACTION');

    // Settings
    await run(`
      INSERT INTO planner_state (user_id, day_end, nea_fixed, nea_start, focus_min, focus_date, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        day_end=excluded.day_end, nea_fixed=excluded.nea_fixed, nea_start=excluded.nea_start,
        focus_min=excluded.focus_min, focus_date=excluded.focus_date, updated_at=excluded.updated_at
    `, userId, data.dayEnd || '22:00', data.neaFixed ?? 120, data.neaStart || '20:00',
       data.focusMin ?? 0, data.focusDate || '', now);

    // Clear existing data (children first — FK cascade is on but be explicit)
    await run(`DELETE FROM msc_subtopics WHERE subject_id IN (SELECT id FROM msc_subjects WHERE user_id = ?)`, userId);
    await run(`DELETE FROM nea_tech_subtopics WHERE topic_id IN (SELECT id FROM nea_tech WHERE user_id = ?)`, userId);
    await run(`DELETE FROM nea_nontech_subtopics WHERE topic_id IN (SELECT id FROM nea_nontech WHERE user_id = ?)`, userId);
    await run(`DELETE FROM task_subtopics WHERE task_id IN (SELECT id FROM tasks WHERE user_id = ?)`, userId);
    for (const table of ['slots', 'msc_subjects', 'nea_tech', 'nea_nontech', 'notes', 'tasks', 'goals']) {
      await run(`DELETE FROM ${table} WHERE user_id = ?`, userId);
    }

    // Slots
    for (const s of data.slots || []) {
      await run('INSERT INTO slots (id, user_id, label, type, start, dur, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        s.id || uuidv4(), userId, s.label, s.type, s.start, +s.dur || 45, now);
    }

    // MSc subjects + subtopics
    for (const s of data.mscSubjects || []) {
      const sid = s.id || uuidv4();
      await run('INSERT INTO msc_subjects (id, user_id, name, pct, file_data, file_name, file_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        sid, userId, s.name, s.pct || 0,
        s.file?.data || null, s.file?.name || null, s.file?.type || null, now);
      for (const st of s.subtopics || []) {
        await run('INSERT INTO msc_subtopics (id, subject_id, name, total, done) VALUES (?, ?, ?, ?, ?)',
          st.id || uuidv4(), sid, st.name, st.total || 1, st.done || 0);
      }
    }

    // NEA Tech + subtopics
    for (const s of data.neaTech || []) {
      const sid = s.id || uuidv4();
      await run('INSERT INTO nea_tech (id, user_id, name, pct, file_data, file_name, file_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        sid, userId, s.name, s.pct || 0,
        s.file?.data || null, s.file?.name || null, s.file?.type || null, now);
      for (const st of s.subtopics || []) {
        await run('INSERT INTO nea_tech_subtopics (id, topic_id, name, total, done) VALUES (?, ?, ?, ?, ?)',
          st.id || uuidv4(), sid, st.name, st.total || 1, st.done || 0);
      }
    }

    // NEA NonTech + subtopics
    for (const s of data.neaNonTech || []) {
      const sid = s.id || uuidv4();
      await run('INSERT INTO nea_nontech (id, user_id, name, pct, file_data, file_name, file_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        sid, userId, s.name, s.pct || 0,
        s.file?.data || null, s.file?.name || null, s.file?.type || null, now);
      for (const st of s.subtopics || []) {
        await run('INSERT INTO nea_nontech_subtopics (id, topic_id, name, total, done) VALUES (?, ?, ?, ?, ?)',
          st.id || uuidv4(), sid, st.name, st.total || 1, st.done || 0);
      }
    }

    // Notes
    for (const n of data.notes || []) {
      await run('INSERT INTO notes (id, user_id, title, cat, body, file_data, file_name, file_type, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        n.id || uuidv4(), userId, n.title, n.cat, n.body || '',
        n.file?.data || null, n.file?.name || null, n.file?.type || null,
        n.date || new Date().toLocaleDateString(), now);
    }

    // Tasks + subtopics
    for (const t of data.tasks || []) {
      const tid = t.id || uuidv4();
      await run('INSERT INTO tasks (id, user_id, name, track, dead, window, status, total, done, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        tid, userId, t.name, t.track, t.dead, t.window || '',
        t.status || 'todo', t.total || 1, t.done || 0, now);
      for (const st of t.subtopics || []) {
        await run('INSERT INTO task_subtopics (id, task_id, name, total, done) VALUES (?, ?, ?, ?, ?)',
          st.id || uuidv4(), tid, st.name, st.total || 1, st.done || 0);
      }
    }

    // Goals
    for (const g of data.goals || []) {
      await run('INSERT INTO goals (id, user_id, title, desc, track, pct, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        g.id || uuidv4(), userId, g.title, g.desc || '', g.track, g.pct || 0, now);
    }

    await run('COMMIT');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    try { await run('ROLLBACK'); } catch (_) { /* ignore */ }
    res.status(500).json({ error: 'Failed to save' });
  }
});

// ===== HEALTH CHECK =====
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Dual-Track Planner server running on http://localhost:${PORT}`);
});
