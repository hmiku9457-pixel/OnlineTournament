# OnlineTournament

A public, browser-based tournament platform with a primary focus on table tennis and a generic stage architecture for future sports.

## Product goals

- Open registration for organizers.
- Singles and doubles.
- Round robin, groups, Swiss, knockout, double elimination, placement and consolation formats.
- Multi-stage combinations such as **Swiss → Top 8 knockout** and **Groups → knockout**.
- Automatic format recommendations based on participant count, tables and desired minimum matches.
- Automatic draw, scheduling and table assignment with manual override.
- Logical venue areas and preferred/strict group-to-table assignments.
- Live set scoring via a shared match code.
- Final result confirmation via one player code per side.
- Responsive spectator mode for desktop and mobile.
- Tablet-oriented scoring UI.
- Printable schedules through browser print styles.
- PWA shell/offline fallback, while online connectivity remains the normal operating mode.

## Current status

This repository is a **large 0.1 foundation**, not a production-ready tournament service yet. It contains the architecture, database schema, security foundation, engine modules, demo UI, tests and deployment pipeline required to continue feature development without rebuilding the core.

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the boundary between implemented foundation and remaining product work.

## Stack

- React + TypeScript
- Vite
- Supabase Auth / PostgreSQL / Realtime / RLS
- Vitest
- GitHub Actions + GitHub Pages

## Quick start

```bash
cp .env.example .env.local
npm install
npm run dev
```

Without Supabase environment variables the demo shell still renders, but login and persistence remain disabled.

## Tournament model

```text
Tournament
└── Competition (Singles / Doubles)
    ├── Stage 1: Groups / Swiss / Round Robin
    ├── Stage 2: Knockout
    └── Stage 3: Placement (optional)
```

This avoids hard-coding combinations and supports Swiss → knockout as a first-class workflow.

## Scoring workflow

```text
Match code
   ↓
unlock this match
   ↓
enter completed sets live
   ↓
FINISHED
   ↓
player code from side A + side B
   ↓
CONFIRMED
   ↓
official standings / advancement
```

In doubles, one valid player code from each pair is sufficient.

## Important security note

Short codes are stored only as hashes in PostgreSQL. The included RPCs form a secure starting point, but production deployment still needs rate limiting, server-side match-completion validation, audit coverage for all corrections and abuse controls. See [`docs/SCORING_AND_SECURITY.md`](docs/SCORING_AND_SECURITY.md).

## License

MIT

## DB-loser Prototyp-Modus

Bis zur Anbindung von Supabase kann der komplette UX-Fluss lokal getestet werden. Neu erstellte Turniere werden im Browser per `localStorage` gespeichert. Das Dashboard zeigt ausschließlich diese lokal erstellten Turniere; ein statischer Demo-Testpool wird nicht mehr mitgeliefert.

Klickbare Prototyp-Oberflächen:

- Turniererstellung → lokales Turnier
- Turnierdetail → Turnierleitung
- Turnierleitung mit Übersicht, Spielen, Teilnehmern, Phasen und Tischen
- Spieleransicht
- Zuschauer-/Liveansicht
- Tablet-Ergebniseingabe

Die Laufzeitdaten für Spiele und Tischbelegung sind derzeit bewusst Mock-Daten. Sie dienen dazu, UI/UX und Informationsdichte vor der Datenbankanbindung festzulegen.
