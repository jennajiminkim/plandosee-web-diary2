-- Task 7: non-destructive import deduplication ledger.
-- Apply only to the Task 7 Neon database, NOT Task 6 Supabase.
-- The web runtime always uses SET LOCAL ROLE pds_runtime with verified app.user_id.
BEGIN;
CREATE TABLE IF NOT EXISTS public.pds_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL CHECK (length(user_id)>0),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  source_format text NOT NULL DEFAULT 'plan.do.see',
  record_counts jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, fingerprint)
);
ALTER TABLE public.pds_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pds_import_batches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pds_import_batches_owner ON public.pds_import_batches;
CREATE POLICY pds_import_batches_owner ON public.pds_import_batches
FOR ALL USING (user_id = nullif(current_setting('app.user_id', true), ''))
WITH CHECK (user_id = nullif(current_setting('app.user_id', true), ''));
GRANT USAGE ON SCHEMA public TO pds_runtime;
GRANT SELECT, INSERT ON public.pds_import_batches TO pds_runtime;
COMMIT;
