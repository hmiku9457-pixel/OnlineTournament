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


## Aktueller lokaler UI-Prototyp

Der Turnier-Wizard unterstützt optional einen Hallenplan im Grunddaten-Schritt.
Standardmäßig liegen alle Tische in einer Reihe. Im Editor sind beliebige
zusätzliche Reihen/Spalten, Tausch von Tischpositionen, Freiflächen sowie
Turnierleitung im Raster oder an einer Außenseite möglich. Nur aktivierte
Hallenpläne werden mit dem lokalen Turnier gespeichert und rechts neben den
Tischkarten der Turnierleitung angezeigt.

Nach Abschluss des Turniers erscheint in der Turnierleitung der Tab
**Endplatzierungen**. Frühere Gruppenplatzierungen werden bewusst nicht zu
einem künstlichen globalen Gesamtrang umgerechnet.

Doppel-K.-o. und Platzierungs-/Trostrunde sind aus der Auswahl für neue
Turniere entfernt. Alte lokale Testdaten mit diesen Typen bleiben vorerst
lesbar; die Datenbankanbindung wird weiterhin nicht benötigt.

### Hallenlayout und Teilnehmer vor dem Start

Im Wizard unter **Grunddaten** ist der Hallenlayout-Editor standardmäßig eingeblendet. Das anfängliche Raster hat **10 × 3 Felder**; bei mehr als 30 Tischen wird es nach unten vergrößert. Der Schalter **Hallenlayout verwenden** entscheidet, ob der Plan mit dem lokalen Turnier gespeichert und in der Tischübersicht angezeigt wird. Der Editor bleibt unabhängig vom Schalter sichtbar.

Unter **Turnierleitung → Teilnehmer** können vor dem **ersten Turnierstart** weitere Einzelspieler beziehungsweise Doppelpaare nachgemeldet werden. Bereits registrierte Namen werden erkannt, ein Spielercode wird automatisch vergeben. Vor Turnierstart zurückgezogene Spieler bleiben zur Nachvollziehbarkeit im Teilnehmerverzeichnis stehen, gehören aber nicht mehr zu Gruppen, K.-o.-Startplätzen oder offenen Spielpaarungen. Nach Turnierstart sind Nachmeldungen gesperrt; für Rückzüge gelten dann weiterhin die Wettkampf-/Walkover-Regeln.

### Lokaler Betriebsmodus (ohne Datenbank)

Die Turnierleitung arbeitet weiterhin mit Browser-`localStorage`. Laufende Spiele können an einen anderen Tisch verlegt oder mitsamt Satzergebnissen wieder in die Warteschlange gesetzt werden. Während einer Pause sind neue Tischzuweisungen gesperrt. Der neue Tab **Protokoll** dokumentiert lokale Änderungen; bei der neuesten Korrektur kann der vorherige Endstand wiederhergestellt werden, solange die Folgephase noch nicht gestartet ist.

**Codes im Prototyp:** Der Match-Code wird für jede Partie aus ihrer ID abgeleitet; der Spielercode stammt aus den Teilnehmerdaten beziehungsweise aus einer lokalen Testnummer. Das ist ausschließlich ein Testmechanismus und **kein Produktions-Sicherheitsmodell**. Vor einem Go-live sind Authentifizierung, serverseitige Autorisierung und sichere zufällige Codes erforderlich. Die lokale Audit-Historie ist nicht manipulationssicher.
