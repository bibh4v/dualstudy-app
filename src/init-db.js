import Database from 'sqlite3';
import { join } from 'path';
import { mkdirSync } from 'fs';

const dataDir = join(process.cwd(), 'data');
mkdirSync(dataDir, { recursive: true });

const db = new Database.Database(join(dataDir, 'planner.db'));

// ensureSchema is async — wrap in an IIFE since this is a CLI entry point
const { ensureSchema } = await import('./schema.js');
await ensureSchema(db);

console.log('Database initialized successfully at', join(dataDir, 'planner.db'));
db.close();
