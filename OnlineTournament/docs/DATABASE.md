# Database model

## Core

- `profiles`: registered platform users.
- `organizations`: optional club/organizer grouping.
- `tournaments`: top-level event.
- `competitions`: singles/doubles divisions inside a tournament.
- `people`: human participants, scoped to one tournament.
- `participants`: competitive sides. One person for singles, two people for doubles.
- `participant_members`: relation between sides and people.

## Format engine

- `stages`: ordered phases such as GROUPS, SWISS and KNOCKOUT.
- `stage_participants`: seeded inputs of a phase.
- `groups` / `group_members`: group phase model.
- `matches` / `match_sides` / `match_sets`: match model.

## Venue & scheduling

- `venues`: tournament location.
- `areas`: logical sub-area inside a venue.
- `play_tables`: physical tables/courts.
- `group_table_preferences`: preferred or strict group-to-table mapping.

## Security-sensitive values

`people.player_code_hash` and `matches.match_code_hash` store bcrypt-compatible pgcrypto hashes, never clear text codes. Direct column access is revoked for browser roles. Verification is performed via `SECURITY DEFINER` RPCs.

## Deletion

A running or paused tournament cannot be deleted. Product logic should prefer `deleted_at` soft deletion, even though RLS also blocks direct deletes in running states.
