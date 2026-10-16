-- Run once in the Supabase SQL editor (and again after adding tables).
-- Supabase exposes every table in "public" through its REST API (PostgREST) for the anon/authenticated roles.
-- This app never uses that API (it connects directly as the table owner), so turn it off for our tables:
--   1. Row Level Security with no policies denies anon/authenticated everything; the owner (our server) is unaffected.
--   2. Revoke the API roles' privileges as a second layer.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('public', 'drizzle') LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
