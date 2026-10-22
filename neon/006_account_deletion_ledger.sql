-- Import fingerprints are also owned personal data and must be erased on exit.
-- Apply to the isolated test branch first. Production remains deletion-disabled.
BEGIN;
GRANT DELETE ON public.pds_import_batches TO pds_runtime;
COMMIT;
