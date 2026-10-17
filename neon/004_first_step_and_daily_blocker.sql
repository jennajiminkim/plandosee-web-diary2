-- Task 7: PLAN / DO sidebar extension, run on an existing Neon diary.
-- Idempotent and additive. Does not modify existing task, cell, or log content.
ALTER TABLE public.pds_tasks
  ADD COLUMN IF NOT EXISTS first_step text NOT NULL DEFAULT ''
  CHECK (length(first_step) <= 300);

ALTER TABLE public.pds_cells
  ADD COLUMN IF NOT EXISTS blocker text NOT NULL DEFAULT ''
  CHECK (length(blocker) <= 1000);
