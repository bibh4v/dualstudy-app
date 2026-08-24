// Shared schema definition — used by both init-db.js (CLI) and index.js (server startup)

export const TABLES = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS planner_state (
    user_id TEXT PRIMARY KEY,
    day_end TEXT DEFAULT '22:00',
    nea_fixed INTEGER DEFAULT 120,
    nea_start TEXT DEFAULT '20:00',
    focus_min INTEGER DEFAULT 0,
    focus_date TEXT DEFAULT '',
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS slots (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    label TEXT NOT NULL,
    type TEXT NOT NULL,
    start TEXT NOT NULL,
    dur INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS msc_subjects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    pct INTEGER DEFAULT 0,
    file_data TEXT,
    file_name TEXT,
    file_type TEXT,
    file_size INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS msc_subtopics (
    id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    name TEXT NOT NULL,
    total INTEGER DEFAULT 1,
    done INTEGER DEFAULT 0,
    FOREIGN KEY (subject_id) REFERENCES msc_subjects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS nea_tech (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    pct INTEGER DEFAULT 0,
    file_data TEXT,
    file_name TEXT,
    file_type TEXT,
    file_size INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS nea_tech_subtopics (
    id TEXT PRIMARY KEY,
    topic_id TEXT NOT NULL,
    name TEXT NOT NULL,
    total INTEGER DEFAULT 1,
    done INTEGER DEFAULT 0,
    FOREIGN KEY (topic_id) REFERENCES nea_tech(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS nea_nontech (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    pct INTEGER DEFAULT 0,
    file_data TEXT,
    file_name TEXT,
    file_type TEXT,
    file_size INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS nea_nontech_subtopics (
    id TEXT PRIMARY KEY,
    topic_id TEXT NOT NULL,
    name TEXT NOT NULL,
    total INTEGER DEFAULT 1,
    done INTEGER DEFAULT 0,
    FOREIGN KEY (topic_id) REFERENCES nea_nontech(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    cat TEXT NOT NULL,
    body TEXT,
    file_data TEXT,
    file_name TEXT,
    file_type TEXT,
    file_size INTEGER,
    date TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    track TEXT NOT NULL,
    dead TEXT NOT NULL,
    window TEXT,
    status TEXT DEFAULT 'todo',
    total INTEGER DEFAULT 1,
    done INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS task_subtopics (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    name TEXT NOT NULL,
    total INTEGER DEFAULT 1,
    done INTEGER DEFAULT 0,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    desc TEXT,
    track TEXT NOT NULL,
    pct INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_slots_user ON slots(user_id);
  CREATE INDEX IF NOT EXISTS idx_msc_user ON msc_subjects(user_id);
  CREATE INDEX IF NOT EXISTS idx_nea_tech_user ON nea_tech(user_id);
  CREATE INDEX IF NOT EXISTS idx_nea_nontech_user ON nea_nontech(user_id);
  CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
  CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);
`;

// Runs the schema against an opened sqlite3 Database instance.
export async function ensureSchema(db) {
  const exec = promisified(db, 'exec');
  const all = (sql) => new Promise((resolve, reject) =>
    db.all(sql, (err, rows) => (err ? reject(err) : resolve(rows))));

  await exec('PRAGMA journal_mode = WAL');
  await exec('PRAGMA foreign_keys = ON');
  await exec(TABLES);

  // Migration: CREATE TABLE IF NOT EXISTS does nothing to tables that already
  // exist, so any column added after a table was first created (e.g. file_size)
  // won't appear on databases created by an earlier version of this app.
  // Add any missing columns here, idempotently, so upgrades never break existing data.
  const requiredColumns = {
    msc_subjects: [['file_size', 'INTEGER']],
    nea_tech: [['file_size', 'INTEGER']],
    nea_nontech: [['file_size', 'INTEGER']],
    notes: [['file_size', 'INTEGER']]
  };

  for (const [table, columns] of Object.entries(requiredColumns)) {
    const existing = await all(`PRAGMA table_info(${table})`);
    const existingNames = new Set(existing.map(c => c.name));
    for (const [name, type] of columns) {
      if (!existingNames.has(name)) {
        await exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
        console.log(`[migration] Added column ${name} to ${table}`);
      }
    }
  }
}

function promisified(obj, method) {
  return (...args) => new Promise((resolve, reject) => {
    obj[method](...args, (err, result) => (err ? reject(err) : resolve(result)));
  });
}
