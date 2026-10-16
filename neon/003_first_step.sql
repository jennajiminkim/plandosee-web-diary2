-- Task7 only: optional per-task first action. Existing task data is preserved.
ALTER TABLE public.pds_tasks ADD COLUMN IF NOT EXISTS first_step text NOT NULL DEFAULT '' CHECK(length(first_step)<=300);
