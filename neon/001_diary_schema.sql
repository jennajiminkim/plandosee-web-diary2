-- plan.do.see task 7 | Neon PostgreSQL | NEW EMPTY DATABASE ONLY
-- This is DATA SCHEMA ONLY. It does NOT implement signup/login, and the
-- existing api/state.js is Supabase-specific and MUST be replaced.
-- Run once in Neon SQL Editor, NOT in the old Supabase database.
-- Never expose Neon DATABASE_URL or connect directly from browser code.
-- Better Auth tables are created separately by Better Auth migrations.
-- user_id is TEXT to match Better Auth's default user id; add FK to "user"
-- after Better Auth tables exist and identifier mapping is confirmed.
BEGIN;

CREATE TABLE public.pds_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id text NOT NULL CHECK(length(user_id)>0),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 180),
 start_date date NOT NULL, end_date date NOT NULL,
 priority integer NOT NULL DEFAULT 1 CHECK(priority BETWEEN 1 AND 999),
 success_criteria text NOT NULL DEFAULT '',
 estimated_minutes integer NOT NULL DEFAULT 0 CHECK(estimated_minutes BETWEEN 0 AND 100000),
 from_reflection_id uuid, deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(end_date>=start_date),
 UNIQUE(user_id,id)
);
CREATE INDEX ON public.pds_plans(user_id,start_date,end_date);

CREATE TABLE public.pds_plan_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id text NOT NULL, plan_id uuid NOT NULL,
 snapshot jsonb NOT NULL, changed_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(user_id,plan_id) REFERENCES public.pds_plans(user_id,id) ON DELETE CASCADE
);
CREATE INDEX ON public.pds_plan_versions(user_id,plan_id,changed_at DESC);

CREATE TABLE public.pds_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id text NOT NULL CHECK(length(user_id)>0),
 plan_id uuid,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 180),
 priority integer NOT NULL DEFAULT 1 CHECK(priority BETWEEN 1 AND 999),
 tag text NOT NULL DEFAULT '생활',
 color text NOT NULL DEFAULT '#dce9dc' CHECK(color ~ '^#[[:xdigit:]]{6}$'),
 due_date date, start_date date, end_date date,
 mode text NOT NULL DEFAULT 'single' CHECK(mode IN ('single','range','repeat')),
 estimated_minutes integer NOT NULL DEFAULT 0 CHECK(estimated_minutes BETWEEN 0 AND 100000),
 estimate_basis text NOT NULL DEFAULT 'total' CHECK(estimate_basis IN ('total','per_session')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','done')),
 completed_at timestamptz, deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(start_date IS NULL OR end_date IS NULL OR end_date>=start_date),
 UNIQUE(user_id,id),
 FOREIGN KEY(user_id,plan_id) REFERENCES public.pds_plans(user_id,id) ON DELETE SET NULL (plan_id)
);
CREATE INDEX ON public.pds_tasks(user_id,plan_id);

CREATE TABLE public.pds_cells (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id text NOT NULL, task_id uuid NOT NULL,
 day date NOT NULL,
 state text NOT NULL DEFAULT 'planned' CHECK(state IN ('planned','progress','done')),
 progress text NOT NULL DEFAULT '', note text NOT NULL DEFAULT '',
 UNIQUE(user_id,task_id,day),
 FOREIGN KEY(user_id,task_id) REFERENCES public.pds_tasks(user_id,id) ON DELETE CASCADE
);
CREATE INDEX ON public.pds_cells(user_id,day);

CREATE TABLE public.pds_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id text NOT NULL, task_id uuid NOT NULL,
 started_at timestamptz NOT NULL, ended_at timestamptz NOT NULL,
 actual_minutes integer NOT NULL CHECK(actual_minutes BETWEEN 0 AND 1440),
 progress text NOT NULL DEFAULT '', blocker text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ended_at>=started_at),
 CHECK(actual_minutes=round(extract(epoch FROM (ended_at-started_at))/60.0)::integer),
 FOREIGN KEY(user_id,task_id) REFERENCES public.pds_tasks(user_id,id) ON DELETE CASCADE
);
CREATE INDEX ON public.pds_logs(user_id,task_id);

CREATE TABLE public.pds_completion_events (
 task_id uuid PRIMARY KEY, user_id text NOT NULL,
 completed_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(user_id,task_id) REFERENCES public.pds_tasks(user_id,id) ON DELETE CASCADE
);

CREATE TABLE public.pds_reflections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id text NOT NULL,
 plan_id uuid NOT NULL, question text NOT NULL DEFAULT '',
 answer text NOT NULL DEFAULT '', improvement text NOT NULL DEFAULT '',
 next_plan_id uuid, updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,plan_id), UNIQUE(user_id,id),
 FOREIGN KEY(user_id,plan_id) REFERENCES public.pds_plans(user_id,id) ON DELETE CASCADE,
 FOREIGN KEY(user_id,next_plan_id) REFERENCES public.pds_plans(user_id,id) ON DELETE SET NULL (next_plan_id)
);
ALTER TABLE public.pds_plans ADD CONSTRAINT pds_plans_reflection_same_owner
 FOREIGN KEY(user_id,from_reflection_id) REFERENCES public.pds_reflections(user_id,id)
 ON DELETE SET NULL (from_reflection_id);

CREATE TABLE public.pds_weekly_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id text NOT NULL, week_start date NOT NULL, entry_date date NOT NULL,
 plan_id uuid,
 question text NOT NULL DEFAULT '', discovery text NOT NULL DEFAULT '',
 next_action text NOT NULL DEFAULT '',
 bg_color text NOT NULL DEFAULT '#FAFAFA' CHECK(bg_color ~ '^#[[:xdigit:]]{6}$'),
 date_color text NOT NULL DEFAULT '#1E4099' CHECK(date_color ~ '^#[[:xdigit:]]{6}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(extract(isodow FROM week_start)=1),
 UNIQUE(user_id,week_start),
 FOREIGN KEY(user_id,plan_id) REFERENCES public.pds_plans(user_id,id) ON DELETE SET NULL (plan_id)
);

CREATE TABLE public.pds_color_swatches (
 user_id text NOT NULL,
 color text NOT NULL CHECK(color ~ '^#[[:xdigit:]]{6}$'),
 usage_count integer NOT NULL DEFAULT 1 CHECK(usage_count>=0),
 last_used timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,color)
);

-- Card 5: five real observation days, one metric, one rule revision.
CREATE TABLE public.pds_experiments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL,
 question text NOT NULL CHECK(length(btrim(question))>0),
 metric_name text NOT NULL CHECK(length(btrim(metric_name))>0),
 metric_unit text NOT NULL CHECK(length(btrim(metric_unit))>0),
 calculation_rule text NOT NULL CHECK(length(btrim(calculation_rule))>0),
 missing_rule text NOT NULL DEFAULT '',
 duplicate_rule text NOT NULL DEFAULT '',
 outlier_rule text NOT NULL DEFAULT '',
 rounding_rule text NOT NULL DEFAULT '',
 week_start_day integer NOT NULL DEFAULT 1 CHECK(week_start_day=1),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,id)
);

CREATE TABLE public.pds_daily_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id text NOT NULL, experiment_id uuid NOT NULL,
 record_date date NOT NULL, metric_value numeric(14,4),
 note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,experiment_id,record_date),
 UNIQUE(user_id,experiment_id,id),
 FOREIGN KEY(user_id,experiment_id) REFERENCES public.pds_experiments(user_id,id) ON DELETE CASCADE
);

CREATE TABLE public.pds_rule_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id text NOT NULL, experiment_id uuid NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now(),
 old_rule text NOT NULL, new_rule text NOT NULL,
 reason text NOT NULL,
 day1_record_id uuid NOT NULL, day2_record_id uuid NOT NULL,
 UNIQUE(user_id,experiment_id),
 CHECK(day1_record_id<>day2_record_id),
 FOREIGN KEY(user_id,experiment_id) REFERENCES public.pds_experiments(user_id,id) ON DELETE CASCADE,
 FOREIGN KEY(user_id,experiment_id,day1_record_id)
  REFERENCES public.pds_daily_records(user_id,experiment_id,id),
 FOREIGN KEY(user_id,experiment_id,day2_record_id)
  REFERENCES public.pds_daily_records(user_id,experiment_id,id)
);

-- Defense in depth. These policies require a trusted SERVER transaction:
-- SELECT set_config('app.user_id', VERIFIED_SESSION_USER_ID, true);
-- Do not let clients control app.user_id; do not use superuser/BYPASSRLS.
-- The web application's database role must be least-privileged and must
-- not own these tables; FORCE RLS applies even to table owners.
DO $$
DECLARE tbl text;
BEGIN
 FOREACH tbl IN ARRAY ARRAY[
  'pds_plans','pds_plan_versions','pds_tasks','pds_cells','pds_logs',
  'pds_completion_events','pds_reflections','pds_weekly_reviews',
  'pds_color_swatches','pds_experiments','pds_daily_records','pds_rule_changes'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',tbl);
  EXECUTE format(
   'CREATE POLICY %I ON public.%I FOR ALL USING (user_id = nullif(current_setting(''app.user_id'',true),'''')) WITH CHECK (user_id = nullif(current_setting(''app.user_id'',true),''''))',
   tbl||'_owner',tbl
  );
 END LOOP;
END $$;
COMMIT;

-- Remaining work BEFORE use:
-- 1) Install Better Auth tables (via Better Auth CLI migration).
-- 2) Add REFERENCES "user"(id) to user_id after confirming schema.
-- 3) Create a distinct least-privilege application DB role, apply GRANTs.
-- 4) Implement server auth, per-request transaction/tenant context,
--    owner checks in all CRUD, list, import, export, and RPC-like operations.
-- 5) Implement rule-change timing checks, day count, and summary comparison.
-- 6) Verify anonymous 401, A<->B read/write/delete 403/404, logout revocation.
-- THIS SQL ALONE DOES NOT MAKE THE DIARY PRIVATE.
