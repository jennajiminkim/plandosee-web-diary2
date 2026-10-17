-- Task 7 extension: daily one-line journal cards (additive, no existing data changes).
-- Run once in the production Neon SQL Editor, then deploy the daily-card code.
-- The old pds_weekly_reviews table and all its records remain untouched.
BEGIN;

CREATE TABLE IF NOT EXISTS public.pds_daily_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL CHECK(length(user_id)>0),
  entry_date date NOT NULL,
  plan_id uuid,
  question text NOT NULL DEFAULT '',
  discovery text NOT NULL DEFAULT '',
  next_action text NOT NULL DEFAULT '',
  bg_color text NOT NULL DEFAULT '#FAFAFA' CHECK(bg_color ~ '^#[[:xdigit:]]{6}$'),
  date_color text NOT NULL DEFAULT '#1E4099' CHECK(date_color ~ '^#[[:xdigit:]]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pds_daily_journals_user_day UNIQUE(user_id, entry_date),
  CONSTRAINT pds_daily_journals_plan_owner
    FOREIGN KEY(user_id,plan_id) REFERENCES public.pds_plans(user_id,id)
    ON DELETE SET NULL (plan_id)
);

CREATE INDEX IF NOT EXISTS pds_daily_journals_user_date_idx
  ON public.pds_daily_journals(user_id,entry_date DESC);

ALTER TABLE public.pds_daily_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pds_daily_journals FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_policies
   WHERE schemaname='public' AND tablename='pds_daily_journals'
     AND policyname='pds_daily_journals_owner'
 ) THEN
  CREATE POLICY pds_daily_journals_owner ON public.pds_daily_journals
   FOR ALL
   USING(user_id = nullif(current_setting('app.user_id',true),''))
   WITH CHECK(user_id = nullif(current_setting('app.user_id',true),''));
 END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pds_daily_journals TO pds_runtime;

COMMIT;

-- Read-only verification:
-- SELECT tablename, policyname FROM pg_policies
-- WHERE schemaname='public' AND tablename='pds_daily_journals';
-- SELECT COUNT(*) AS existing_daily_cards FROM public.pds_daily_journals;
