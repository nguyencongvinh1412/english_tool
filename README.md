# English Practice

AI-powered English practice for Vietnamese learners: conversation, pronunciation, scenarios, and dictation, with invite-only accounts and per-user AI quotas.

AI requests go to a self-hosted [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) (OpenAI-compatible), falling back to Groq when the proxy is unreachable.

## Requirements

- Node.js 22.13+ (24 recommended)
- Docker Desktop
- CLIProxyAPI running on `localhost:8317` (optional; Groq fallback otherwise)

## Setup

```bash
cp .env.example .env     # then fill in DB_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD, CLIPROXY_API_KEY
npm install
```

On first start the server applies migrations and creates the admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` if no admin exists.

## Run

| Mode | Command | URL |
|---|---|---|
| Full stack in Docker | `npm run docker:up` | http://localhost:3003 |
| Development (hot reload) | `npm run db:up` then `npm run dev` | http://localhost:5173 |
| Local production build | `npm run db:up` then `npm run local` | http://localhost:3002 |

Docker Desktop groups the `english-tool-app` and `english-tool-db` containers under the **english-tool** project, on the `english-tool-net` network. Data lives in the `english-tool-pgdata` volume.

## Accounts

Sign-up requires an invite code. As admin:

```bash
# Create an invite (or use Admin → Invite codes in the UI)
curl -b cookies.txt -X POST http://localhost:3003/api/admin/invites \
  -H 'Content-Type: application/json' -d '{"maxUses": 1, "expiresInDays": 7}'
```

- **Learners**: `LEARNER_DAILY_AI_LIMIT` AI requests per day (default 100), models from `LEARNER_MODELS` unless the admin assigns others.
- **Admins**: unlimited AI, any model except opus/fable, user and invite management.

## Database

| Command | Purpose |
|---|---|
| `npm run db:generate` | Create a SQL migration after editing `server/db/schema.ts` |
| `npm run db:migrate` | Apply migrations manually (the server also applies them on startup) |
| `npm run db:studio` | Browse data with Drizzle Studio |

Migrations are plain SQL in `server/db/migrations`, so they also run on Supabase: point `DATABASE_URL` at the Supabase pooler.

## Tests

```bash
npm run db:up   # tests use the separate english_tool_test database
npm test
```
