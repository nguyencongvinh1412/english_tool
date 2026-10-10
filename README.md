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

Docker Desktop groups the `english-tool-app`, `english-tool-db` and `english-tool-tts` containers under the **english-tool** project, on the `english-tool-net` network. Data lives in the `english-tool-pgdata` volume, generated speech in `english-tool-tts-cache`, and uploaded test books and media in `english-tool-uploads`.

## Voices

Listening content is read by [Kokoro](https://github.com/remsky/Kokoro-FastAPI) (Apache 2.0), a neural text-to-speech model running on CPU in the `tts` container. Each sentence is generated once and cached; conversations use a different voice per speaker. If the service is down the app falls back to the browser's built-in voices.

- `npm run dev` uses `TTS_BASE_URL=http://localhost:8880` (start it with `docker compose up -d tts`)
- Leave `TTS_BASE_URL` empty to use browser voices only

## Import TOEIC Tests

Admins can import practice books from **Admin → Imports**. Upload a PDF or DOCX, mark the question pages and optional answer-key/transcript pages, then review the extracted groups before publishing. Scanned PDFs can be rendered in the browser for OCR and Part 1 photo crops.

Listening groups can use an uploaded recording with optional start/end times. Without a recording, the app reads the imported transcript with Kokoro and falls back to browser voices when Kokoro is unavailable. Published imports appear as official tests in the TOEIC exam catalog.

Uploaded source books, page renders, photos and recordings are stored on local disk under `UPLOAD_DIR` (default `.cache/uploads`). Keep that directory persistent in deployments; Docker Compose mounts it as `english-tool-uploads`.

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
