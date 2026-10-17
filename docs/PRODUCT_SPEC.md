# Product specification – 0.1 baseline

## Scope

OnlineTournament is a public tournament platform for arbitrary clubs/organizers. Table tennis is the first fully specified sport, while the core tournament engine should remain sport-neutral where practical.

Registration is open. A confirmed account may create and publish tournaments. Moderation states are reserved in the account model for later use.

## Formats

The long-term engine supports independent phase building blocks:

- round robin,
- group phase,
- Swiss system,
- single elimination,
- double elimination,
- placement/consolation stages.

Recommendations may combine those building blocks (for example Groups → Knockout, Swiss → Knockout, or Groups → Swiss), but combinations are never treated as indivisible tournament systems. Organizers enable/disable the individual systems and may freely edit the resulting phase sequence.

The UI recommends suitable phase templates based on participant count, table count and desired minimum matches. The organizer may always override the recommendation, including the recommended number of groups, Swiss rounds and knockout entrants. A recommendation is optional rather than mandatory.

Tournament creation is a staged wizard:

1. enter basic data (name, sport, discipline, tables); 1–12 tables use quick-select buttons and larger events use Custom,
2. enter participants; participant count is derived and is never required up front,
3. choose desired minimum matches with quick-select buttons for 1–6 or Custom,
4. optionally choose a calculated recommendation; a right-side settings panel limits recommendation values and independently enables/disables each tournament system,
5. configure the actual phase sequence. Phases may be added, removed, reordered and edited independently. Group count and Swiss rounds are editable again here, and knockout Best-of may differ by knockout round.

## Table tennis

- Singles and doubles.
- A person may enter singles only, doubles only, or both.
- Best-of is configurable per phase and odd-numbered. Best-of-1 is explicitly supported.
- Sets are played to 11, win by 2.
- The product records completed sets, not individual rallies/points.
- Default ranking order: wins → set difference → sets won → Buchholz.
- Buchholz is primarily relevant to Swiss stages and tie-breakers should remain stage-configurable.

## Participants

Required person fields:

- first name,
- last name,
- status.

Optional fields include club, rating and birth year. Persons exist only inside one tournament.

A doubles pair is represented as one competitive participant with two person members. Participant entry uses one compact input mask; only completed entries are added to the participant list. Saved entries can be edited from the list. Validation messages are collected beside the save action while invalid fields remain highlighted. A player name may not be entered twice; in doubles the same person also cannot appear in two pairs or occupy both positions of one pair. The wizard cannot continue until at least two complete competitive participants exist.

## Seeding & draws

Seeding is optional. When enabled, the system proposes a deterministic draw that the organizer can edit before confirmation.

For knockout stages, the system should avoid rematches and participants from the same previous group in the first round where possible without destroying the intended seeding structure.

## Withdrawals

A withdrawn player remains in historical standings/results. Already confirmed matches do not change. Future scheduled matches become walkovers.

Bye propagation must avoid meaningless double-bye chains; an empty/withdrawn branch should resolve to the actually eligible participant.

## Scheduling

The organizer configures tables during tournament creation.

Location hierarchy:

`venue → logical area → table`

Examples of logical areas are "main field" and "side field". A group may have preferred tables or strict table restrictions.

Table assignment is automatic but always overridable. Minimum rest time is a soft constraint: the scheduler warns/penalizes short rest, but the organizer may still start the match and players may decide to wait.

No precise time-plan or automated PA/player-call system is required in the first versions.

## Scoring

Each match receives one shared short match code. Entering it on a table device unlocks scoring for only that match.

Completed sets are synchronized live, enabling spectators to see a set score such as 2:1 while a match is running.

After the result is finalized, each side confirms it with a tournament-scoped player code. In doubles, any one player from each pair may confirm.

Official standings and automatic advancement use only confirmed matches and administrative walkovers.

Authorized staff may correct/reset results and confirmations; production correction flows must be audit-logged.

## Clients

- Desktop: primary organizer/admin interface with dense information.
- Tablet: comfortable table-side score entry.
- Smartphone: primarily information and spectator access.
- Spectator view: responsive desktop/mobile view; it may also be shown fullscreen on a projector/TV, so no separate TV application is required initially.

## Web/PWA

Online connectivity is considered normal and expected. A PWA/service-worker shell provides resilience and the foundation for an emergency offline mode, but install-to-home-screen is not a product priority.

## Output

- No CSV/Excel import requirement initially.
- No dedicated PDF generator initially.
- Schedules/brackets should be printable with browser print CSS, which also permits "Save as PDF".
- JSON backup/import is a later resilience feature, not a 0.1 requirement.

## Deletion lifecycle

A tournament may be deleted only when it is not actively running:

- allowed: DRAFT, REGISTRATION, READY, ABORTED, FINISHED, ARCHIVED;
- blocked: RUNNING, PAUSED.

Deletion is implemented as soft deletion for recovery/audit safety.
