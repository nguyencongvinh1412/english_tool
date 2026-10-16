# Deploying English Practice

```
Learners ──https──▶ Render (web app, Docker: Express + SPA)
                      ├──▶ Supabase Postgres      (users, progress, question bank)
                      ├──▶ Supabase Storage (S3)  (imported books, photos, recordings)
                      ├──▶ Anthropic / Gemini APIs (official keys, chosen in Admin -> Plans)
                      └──▶ Kokoro on a Hugging Face Space (voices, optional; browser voices until set)
```

On your own machine nothing changes: `npm run dev` with the CLI proxy and the Docker database. The two databases
are separate, so the AI source (Admin -> Plans) must be set again in production.

## What you need

- A **Supabase** project (region Singapore is closest to Vietnam).
- A **Render** account connected to the GitHub repository.
- An **Anthropic API key** (console.anthropic.com, prepaid credit) and optionally a **Gemini API key**.
- Optional: a domain (Cloudflare DNS) for `learn.<your-domain>`.

## 1. Supabase

1. **Database.** Project Settings → Database → Connection string:
   - *Transaction pooler* (port 6543) → `DATABASE_URL`, e.g.
     `postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require`
   - *Session pooler* or *Direct* (port 5432) → `DATABASE_MIGRATION_URL`.
   The app applies migrations on startup through `DATABASE_MIGRATION_URL`.
2. **Storage.** Storage → New bucket `media`, **private** (never public: files are served only to signed-in users
   through the app). Storage → Settings → S3 Connection: enable, note the endpoint and region, and create an
   access key → `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.

### Move existing data (optional)

From the Mac, with the local stack running:

```bash
# Database: schema, migrations table and data
docker exec english-tool-db pg_dump -U english --no-owner --no-privileges english_tool > english_tool.sql
psql "$DATABASE_MIGRATION_URL" -f english_tool.sql

# Files: copy the uploads volume, then push it to the bucket under the same keys
docker cp english-tool-app:/data/uploads ./uploads-export
SOURCE_DIR=./uploads-export S3_ENDPOINT=... S3_REGION=... S3_BUCKET=media \
  S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... npm run storage:copy-to-s3
```

Delete `english_tool.sql` and `uploads-export` afterwards; they contain user data.

## 2. Render

1. Merge the release branch into `main` and push.
2. Render → New → **Blueprint** → pick the repository; it reads `render.yaml`.
3. Fill in the secret values:

| Variable | Value |
|---|---|
| `DATABASE_URL`, `DATABASE_MIGRATION_URL` | Supabase connection strings (step 1) |
| `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Supabase S3 connection (step 1) |
| `TTS_BASE_URL` | the Hugging Face Space URL (phase D3). Until then enter any placeholder; the app falls back to browser voices |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | first admin; use a long unique password (skip if you restored the database) |
| `LEARNER_MODELS` | models learners may use (default in render.yaml: `claude-haiku-5-5,gemini-3-flash`) |
| `SETTINGS_SECRET` | 16+ characters; encrypts API keys saved in Admin → Plans. Without it keys come only from the two variables below |
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` | official API keys, used when the admin sets the AI source to "Official API" |
| `GROQ_API_KEY` | optional chat fallback |

4. Deploy, then open `https://english-learning-tool.onrender.com/api/health` (or the URL Render shows) and sign in as admin.
   The blueprint uses the free plan, which sleeps after 15 idle minutes; choose *Starter* in Render to keep it awake.
5. **Switch the AI source:** sign in as admin -> Admin -> Plans -> AI source -> *Official API*, paste the Anthropic key
   (or set `ANTHROPIC_API_KEY`), press the test button with `claude-haiku-5-5`. New databases start in proxy mode, so
   AI features fail until you do this.
6. Optional: add a custom domain in Render (e.g. `learn.<your-domain>`).

## 3. Personal use: reach your own CLI proxy from Render (ngrok)

Only for a deployment used by you alone (the proxy runs on personal subscription accounts; never sell or share it).

1. Create an ngrok account, `brew install ngrok`, `ngrok config add-authtoken <token>`.
2. ngrok dashboard -> Domains -> create the free static domain, e.g. `abc-xyz.ngrok-free.app`.
3. With CLIProxyAPI running on :8317, start the tunnel on the Mac:
   `ngrok http --url=abc-xyz.ngrok-free.app 8317`
4. Check: `curl -H "Authorization: Bearer $CLIPROXY_API_KEY" https://abc-xyz.ngrok-free.app/v1/models`
5. Render -> Environment: `CLIPROXY_BASE_URL=https://abc-xyz.ngrok-free.app` (no trailing slash) and `CLIPROXY_API_KEY`
   (use a long random key, 32+ characters: the address is public). Redeploy, keep Admin -> Plans -> AI source on *Proxy*
   and press the test button.

The Mac, CLIProxyAPI and ngrok must be running for AI features; everything else works without them.
Switch to *Official API* and stop the tunnel before real users arrive.

## 4. Voices

Production uses the learner's **browser voices** (`TTS_BASE_URL` empty). To get natural voices later, point
`TTS_BASE_URL` at any Kokoro-compatible server (`/v1/audio/speech`, `/v1/audio/voices`; add `TTS_API_TOKEN` if it
needs a bearer token). With `STORAGE_DRIVER=s3` every generated clip is cached in the bucket (`media/tts/<hash>.mp3`),
so each sentence is generated once, and a server that is asleep is woken when a learner opens the site
(`/api/tts/status` reports `waking`; browser voices play meanwhile). `npm run tts:warm` pre-generates English words
and grammar examples from a Kokoro server you run yourself. Hugging Face's free Docker Spaces are not available on
every account; a paid TTS API (Azure Speech, Google) or a small VPS are the alternatives being evaluated.

## 5. Backups and Supabase hardening

**Backups.** The free Supabase plan has no automatic backups. From the Mac (Docker running) put the **session pooler**
string (port 5432) in `.env.backup` as `BACKUP_DATABASE_URL=...` and run `npm run db:backup`. It writes
`backups/english_tool-<time>.dump` (gitignored, owner-only, newest 14 kept) using `pg_dump` from a Postgres 17 image
(`PG_IMAGE` overrides it; use the server's major version or newer). Run it weekly, or add it to cron/launchd.
Restore into an empty database: `pg_restore --no-owner --no-privileges -d "<url>" backups/<file>.dump`.
Uploaded files live in the bucket, which is not covered by the dump; keep the originals of imported books.

**Hardening.** Supabase exposes every table in `public` through its REST API for the anon role unless Row Level Security
is on. The app connects directly as the table owner and never uses that API, so run `scripts/supabase-harden.sql` once in
the Supabase SQL editor (again after migrations that add tables). Never put the Supabase *anon* or *service_role* key in
the app or the browser.

## Security checklist

What the app already does:

- **Accounts:** invite-only sign-up, scrypt password hashes, HttpOnly + Secure + SameSite session cookies,
  Origin check on every state-changing request, rate limits on login, sign-up and password reset.
  Forgotten passwords: an admin creates a one-time reset link (24 hours) from Admin → Users; the user picks
  the new password and every device is signed out.
- **Privacy:** a privacy notice at `/privacy` (linked from sign-up, sign-in and Profile) explains what is stored
  and which AI providers process it; users can delete their account and data from Profile.
- **AI cost and abuse:** system prompts are built on the server from fixed templates with guardrails (the client
  can only pick an activity and send short role-play details); chat requests are capped at 30 messages and
  20,000 characters; every learner has a daily AI quota and a model allowlist (Opus and Fable are always
  blocked); AI routes are limited to 15 requests per minute per learner; voice generation is rate limited.
- **AI output:** every generated or scored result is validated against a schema before it is stored or shown;
  the frontend never renders HTML from AI text.
- **Answers:** test answers stay on the server until a test is submitted.
- **Files:** uploads are admin-only, checked by extension and file signature and size-limited; source books are
  visible to admins only; everything is served through signed-in requests.
- **Headers:** Content-Security-Policy (own scripts only), HSTS, no framing, no MIME sniffing (helmet).
- **Upstreams:** API keys are encrypted at rest (AES-256-GCM with `SETTINGS_SECRET`) and never sent to the browser;
  the Kokoro Space is private or token-protected (phase D3).

Before going live:

- [ ] Use long unique values for `ADMIN_PASSWORD` and `SETTINGS_SECRET`; never commit `.env`.
- [ ] Keep the Supabase bucket private and the database password out of chat and screenshots.
- [ ] Set conservative `LEARNER_DAILY_AI_LIMIT` and `LEARNER_MODELS` for the first users.
- [ ] After the first admin signs in, remove `ADMIN_PASSWORD` from Render.
- [ ] Rotate the service token and API key if either is ever exposed.

Known, accepted risk: `npm audit` reports a moderate issue in `sprintf-js` pulled in by the command-line part of
`mammoth` (DOCX reader). The app only calls mammoth's library API, which does not use it.

## Operations

- **Backups:** Supabase takes daily backups on paid plans. On the free plan, run `pg_dump` against
  `DATABASE_MIGRATION_URL` on a schedule and keep the dumps somewhere private.
- **Logs:** Render → service → Logs. AI failures are logged with the provider's status, never with keys.
- **Mac offline:** expect `ai_unavailable` errors for AI features; nothing else is affected.
- **Japanese dictionary data:** `server/content/ja/vocab-data.json` is built from KANJIDIC2 (CC BY-SA 4.0)
  and MIT-licensed JLPT lists. Refresh it about once a month with `npm run ja:vocab-data`, commit the
  file and redeploy; the server loads the cards on the first start after a change (a hash in `app_meta`
  skips it on ordinary restarts) and keeps the Vietnamese meanings. The
  attribution on the flashcard page is required by the licence (see `server/content/ja/DATA-LICENSE.md`).
- **English vocabulary data:** `server/content/en/vocab-data.json` (NGSL/TSL/NAWL, CEFR-J, CMUdict, Tatoeba;
  see `server/content/en/DATA-LICENSE.md`). Rebuild with `npm run en:vocab-data` (needs `bunzip2`) when the
  lists or Tatoeba are updated; Vietnamese meanings and collocations stay in the database.
- **Vietnamese meanings:** the dictionary ships with English only. Admin → Exam bank → "AI translate 40"
  fills Vietnamese meanings deck by deck (uses the shared AI quota of the admin).
- **JLPT test bank:** before inviting Japanese learners, fill the bank per level in Admin → Exam bank →
  JLPT ("Fill missing" adds 6 checked groups per click; a full N3 test needs about 30). Mini tests generate
  up to 4 missing groups on the spot, but a full test needs the bank.
- **Imported books (TOEIC and JLPT):** published tests are for the learners you invited. Do not import
  books you are not allowed to use, and never share the app publicly with imported tests in it.
- **Grammar map:** explanations are AI drafts in `server/content/en/grammar/*.json` (`npm run grammar:draft`
  writes missing ones; `-- --all` redrafts). They load on startup; once an admin edits or reviews a point in
  Admin → Grammar, the database version is kept. The map structure is `server/grammar/map.ts`.
- **Plans and AI source:** Admin → Plans. Plan limits start switched off (everyone keeps open access while credits
  are counted, so you can see real usage); switch them on when you sell. Plans are granted by hand in the user's
  edit dialog (prepaid, after a bank transfer). Selling requires the official API keys (the proxy uses personal
  subscription accounts) — see `docs/plans/p9-marketing-subscription.md`.
