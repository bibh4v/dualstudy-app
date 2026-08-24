# Dual-Track Planner — Server

Backend for the Dual-Track Planner webapp (MSc + NEA Level 8). Syncs your planner
across all devices with accounts and persistent storage.

## Stack

- **Node.js + Express** — API server
- **SQLite** (`sqlite3`) — embedded database, zero-config
- **bcryptjs** — password hashing
- **Cookie sessions** — 30-day login persistence
- **Static hosting** — serves the frontend from `public/`

## Run locally

```bash
npm install
npm start          # → http://localhost:3000
```

The database auto-creates at `data/planner.db` on first run (schema is applied
idempotently at startup — no separate init step needed).

## Deploy

### Railway

1. Push this folder to a GitHub repo.
2. In [Railway](https://railway.app): **New Project → Deploy from repo**.
3. Railway reads `railway.toml` automatically: Docker build, health check on
   `/api/health`.
4. Add a **Volume** mounted at `/app/data` so the SQLite DB survives redeploys.
5. Set env var `NODE_ENV=production`.

### Render

1. **New → Blueprint** pointing at the repo — `render.yaml` configures everything
   including a 1 GB persistent disk at `/app/data`.

### Docker anywhere

```bash
docker compose up -d --build   # binds port 3000, data in named volume
```

## API

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Create account `{email, password}` |
| POST | `/api/auth/login` | — | Login, sets session cookie |
| POST | `/api/auth/logout` | ✓ | Clear session |
| GET  | `/api/auth/me` | ✓ | Current user |
| GET  | `/api/state` | ✓ | Full planner state |
| PUT  | `/api/state` | ✓ | Bulk-replace full state |
| GET  | `/api/health` | — | Health check |

## Notes

- Attachments are stored as base64 in SQLite (client enforces ~10 MB limit).
- `PUT /api/state` replaces all rows in one transaction — last-write-wins sync.
- Sessions expire after 30 days.
