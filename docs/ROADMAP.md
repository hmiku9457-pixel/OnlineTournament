# Roadmap

## 0.1 Foundation (included)

- Vite / React / TypeScript shell
- GitHub Pages deployment workflow
- Supabase schema, Auth foundation and RLS starter
- stage-oriented tournament model
- singles + doubles data model
- table-tennis rule module
- standings engine
- format recommendation engine
- Swiss pairing starter
- knockout seeding starter
- withdrawal/walkover handling
- scheduler scoring starter
- match-code + player-code RPC foundation
- responsive admin/scoring/spectator screens
- PWA/offline shell cache
- unit tests

## 0.2 Tournament creation

- real CRUD forms backed by Supabase
- participant import/manual entry
- player/match code generation UI
- areas/tables editor
- stage builder
- seeding preview + manual override
- group draw preview + confirmation

## 0.3 Running tournament

- automatic match generation
- richer administrative result correction workflow
- table queue and auto-assignment
- rest-time warnings
- referee/staff roles
- live public standings
- audit log UI

## 0.4 Advanced formats

- Swiss score groups + stronger optimizer
- double elimination
- placement trees
- consolation brackets
- configurable tie-breakers
- format recommendation with estimated duration

## 0.5 Resilience

- offline write queue for emergency scoring
- conflict resolution after reconnect
- optional JSON backup/import
- recovery tools
