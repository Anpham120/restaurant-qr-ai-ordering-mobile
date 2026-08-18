-- Optimistic concurrency (V16): Order Round creation and Table Invoice settlement start must
-- serialize on the shared table session so at most one side commits from the same version.
-- Mirrors the .NET xmin-based check with JPA's standard @Version column instead (per the plan's
-- decision, docs/pm/KE_HOACH_HOC_KY_2026-2.md §5.2: keep the invariant, not the exact mechanism).
ALTER TABLE table_sessions ADD COLUMN version bigint NOT NULL DEFAULT 0;
