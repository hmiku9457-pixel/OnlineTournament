# Contributing

1. Create a focused branch.
2. Add or update tests for engine behavior.
3. Add a Supabase migration for every schema change; never edit a deployed migration retroactively.
4. Run `npm run lint`, `npm run test` and `npm run build`.
5. Keep tournament-engine functions deterministic and independent from React/Supabase.
6. Security-sensitive score or permission changes require RLS/RPC review.
