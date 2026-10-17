# Architecture

OnlineTournament separates the **generic tournament core** from sport-specific rules.

## Layers

1. **Web UI** – React + TypeScript, responsive for desktop, tablet and mobile.
2. **Tournament Engine** – deterministic pure functions for standings, Swiss pairing, bracket creation, withdrawals and scheduling.
3. **Sport Rules** – first module: table tennis (`bestOf`, set to 11, win by 2).
4. **Persistence** – Supabase PostgreSQL with RLS and RPCs.
5. **Realtime** – Supabase Realtime for live set scores and spectator views.

## Important design decisions

- A tournament consists of one or more **competitions** (e.g. singles, doubles).
- Each competition consists of ordered **stages**. This enables groups → knockout and Swiss → knockout without hard-coded combinations.
- Persons and participants are separate. A person may play singles, doubles, both or neither.
- A doubles pair is one participant with two participant members.
- Table locations use `venue -> area -> play_table`. `area` is a logical grouping such as main court / side court.
- Rest time is a soft scheduling constraint. Strict table restrictions remain possible.
- A withdrawn participant remains in tournament history. Future matches become walkovers; confirmed matches remain unchanged.
- Match code unlocks scoring. One player code per side confirms the final result.
- The public live view can show `LIVE` and `FINISHED`, but official standings should use only `CONFIRMED` and `WALKOVER`.

## GitHub Pages

The app uses `HashRouter` and Vite `base: './'` so it can be hosted below a repository path without server-side route rewrites.
