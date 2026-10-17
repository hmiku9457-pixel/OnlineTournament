-- Best-of is a stage-level concern. A tournament can mix e.g. Best-of-1 groups
-- with a Best-of-5 knockout phase. The tournament-level best_of column remains
-- as a backwards-compatible/default value for now.
alter table public.stages
  add column if not exists best_of smallint not null default 5
  check (best_of > 0 and best_of % 2 = 1);
