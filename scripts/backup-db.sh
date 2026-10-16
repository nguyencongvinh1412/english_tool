#!/usr/bin/env bash
# Dumps the production (Supabase) database to backups/<timestamp>.dump and keeps the newest KEEP files.
# Uses pg_dump from a Postgres Docker image, so nothing needs installing. Set the connection string in the
# environment or in .env.backup (gitignored):
#   BACKUP_DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-...pooler.supabase.com:5432/postgres?sslmode=require
# Use the SESSION pooler (port 5432), not the transaction pooler.
# Optional: PG_IMAGE (default postgres:17-alpine; must be at least the server's major version), KEEP (default 14).
# Restore into an empty database:  pg_restore --no-owner --no-privileges -d "<url>" backups/<file>.dump
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${BACKUP_DATABASE_URL:-}" ] && [ -f .env.backup ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.backup
  set +a
fi
: "${BACKUP_DATABASE_URL:?Set BACKUP_DATABASE_URL (session pooler string) in the environment or .env.backup}"

IMAGE="${PG_IMAGE:-postgres:17-alpine}"
KEEP="${KEEP:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p backups
chmod 700 backups
OUT="backups/english_tool-${STAMP}.dump"

# Only our own schemas: Supabase's internal ones (auth, storage, ...) are owned by roles we cannot read.
# The connection string goes in through the environment so it does not show up in the process list.
docker run --rm -e PGURL="$BACKUP_DATABASE_URL" -v "$PWD/backups:/backups" "$IMAGE" \
  sh -c 'pg_dump "$PGURL" --format=custom --no-owner --no-privileges --schema=public --schema=drizzle --file="/backups/'"$(basename "$OUT")"'"'

# Reject an empty or truncated file
[ -s "$OUT" ] || { echo "Backup failed: $OUT is empty" >&2; rm -f "$OUT"; exit 1; }
chmod 600 "$OUT"
echo "Saved $OUT ($(du -h "$OUT" | cut -f1))"

# Keep the newest $KEEP dumps
ls -1t backups/english_tool-*.dump | tail -n +"$((KEEP + 1))" | xargs -I{} rm -f {}
