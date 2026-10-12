# Deploying English Practice

```
Learners ──https──▶ Render (web app, Docker)
                      ├──▶ Supabase Postgres      (users, progress, question bank)
                      ├──▶ Supabase Storage (S3)  (imported books, photos, recordings)
                      └──https + service token──▶ Cloudflare Tunnel ──▶ Mac
                                                     ├─ CLIProxyAPI :8317  (AI)
                                                     └─ Kokoro      :8880  (voices)
```

When the Mac is off, the site still works: lessons, the question bank and published tests are served from
Render and Supabase. AI features (chat, generation, scoring) return a friendly error and listening falls back
to browser voices.

## What you need

- A **Supabase** project (region Singapore is closest to Vietnam).
- A **Render** account connected to the GitHub repository.
- A **Cloudflare** account with a domain you control (any cheap domain works). The tunnel needs it for
  stable hostnames and for Cloudflare Access, which keeps the AI proxy and Kokoro private.

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

## 2. Cloudflare Tunnel (on the Mac)

1. Zero Trust → Networks → Tunnels → **Create a tunnel** (Cloudflared). Copy the token into `.env` as
   `TUNNEL_TOKEN`.
2. Add two **public hostnames** to the tunnel:
   - `ai.<your-domain>` → `http://host.docker.internal:8317` (CLIProxyAPI)
   - `tts.<your-domain>` → `http://tts:8880` (Kokoro, reached on the compose network)
3. Zero Trust → Access → Service Auth → **Create service token**. Keep the Client ID and Secret.
4. Zero Trust → Access → Applications → **Add a self-hosted application** covering both hostnames, with one
   policy: action **Service Auth**, include **Service Token** = the token above. Requests without the token are
   rejected by Cloudflare before they reach the Mac.
5. Start it: `docker compose --profile tunnel up -d tunnel`
6. Check from anywhere (should list models only with the headers):
   ```bash
   curl -H "CF-Access-Client-Id: $ID" -H "CF-Access-Client-Secret: $SECRET" \
        -H "Authorization: Bearer $CLIPROXY_API_KEY" https://ai.<your-domain>/v1/models
   ```

## 3. Render

1. Merge the release branch into `main` and push.
2. Render → New → **Blueprint** → pick the repository; it reads `render.yaml`.
3. Fill in the secret values:

| Variable | Value |
|---|---|
| `DATABASE_URL`, `DATABASE_MIGRATION_URL` | Supabase connection strings (step 1) |
| `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Supabase S3 connection (step 1) |
| `CLIPROXY_BASE_URL` | `https://ai.<your-domain>` |
| `CLIPROXY_API_KEY` | the key from CLIProxyAPI's `config.yaml` |
| `CLIPROXY_MODEL` | default model, e.g. `gemini-3-flash` |
| `TTS_BASE_URL` | `https://tts.<your-domain>` |
| `UPSTREAM_ACCESS_CLIENT_ID`, `UPSTREAM_ACCESS_CLIENT_SECRET` | the service token (step 2) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | first admin; use a long unique password (skip if you restored the database) |
| `LEARNER_MODELS` | models learners may use, e.g. `gemini-3-flash,gpt-5.5` |
| `GROQ_API_KEY` | optional chat fallback |

4. Deploy, then open `https://english-learning-tool.onrender.com/api/health` (or the URL Render shows) and sign in as admin.
   The blueprint uses the free plan, which sleeps after 15 idle minutes; choose *Starter* in Render to keep it awake.
5. Optional: add a custom domain in Render (e.g. `learn.<your-domain>`).

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
- **Upstreams:** the AI proxy and Kokoro are reachable only through Cloudflare Access with a service token, and
  the proxy additionally requires its API key.

Before going live:

- [ ] Use long unique values for `ADMIN_PASSWORD`, `CLIPROXY_API_KEY` and the service token; never commit `.env`.
- [ ] Keep the Supabase bucket private and the database password out of chat and screenshots.
- [ ] Re-login the Claude account in CLIProxyAPI if Claude models report "OAuth access token has been revoked".
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
- **Vietnamese meanings:** the dictionary ships with English only. Admin → Exam bank → "AI translate 40"
  fills Vietnamese meanings deck by deck (uses the shared AI quota of the admin).
- **JLPT test bank:** before inviting Japanese learners, fill the bank per level in Admin → Exam bank →
  JLPT ("Fill missing" adds 6 checked groups per click; a full N3 test needs about 30). Mini tests generate
  up to 4 missing groups on the spot, but a full test needs the bank.
- **Imported books (TOEIC and JLPT):** published tests are for the learners you invited. Do not import
  books you are not allowed to use, and never share the app publicly with imported tests in it.
