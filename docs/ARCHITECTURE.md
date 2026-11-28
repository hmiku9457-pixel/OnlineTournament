# Architecture

OnlineTournament separates the **generic tournament core** from sport-specific rules.

## Layers

1. **Web UI** – React + TypeScript, responsive for desktop, tablet and mobile.
2. **Tournament Engine** – deterministic pure functions for standings, Swiss pairing, bracket creation, withdrawals and scheduling.
3. **Sport Rules** – first module: table tennis (`bestOf`, set to 11, win by 2).
4. **Persistence** – local IndexedDB or owner-scoped Supabase PostgreSQL snapshots with revision checks, immutable operation receipts and exclusive leases.
5. **Live views** – conditional capability polling. Public detail projections are consented and revision-bound; no subscription to private tables.

## Important design decisions

- A tournament consists of one or more **competitions** (e.g. singles, doubles).
- Each competition consists of ordered **stages**. This enables groups → knockout and Swiss → knockout without hard-coded combinations.
- Persons and participants are separate. A person may play singles, doubles, both or neither.
- A doubles pair is one participant with two participant members.
- Table locations use `venue -> area -> play_table`. `area` is a logical grouping such as main court / side court.
- Rest time is a soft scheduling constraint. Strict table restrictions remain possible.
- A withdrawn participant remains in tournament history. Future matches become walkovers; confirmed matches remain unchanged.
- Local match codes are separate from the online player capability. Online player reports are proposals until the director adopts them.
- Historical checkpoints are not direct rollback commands. A confirmed local emergency restoration is available without mutating the canonical online record.

## GitHub Pages

The app uses `HashRouter` and Vite `base: './'` so it can be hosted below a repository path without server-side route rewrites.

The earlier normalized Supabase schema and multi-role design are archived planning material, not the deployed online API. See [Access model](ACCESS_MODEL.md) and [Acceptance test](ONLINE_ACCEPTANCE_TEST.md).
