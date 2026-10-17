# Access model

## Platform account states

- `NORMAL`
- `TRUSTED`
- `RESTRICTED`
- `SUSPENDED`

0.1 uses open registration; the extra states allow moderation later without redesigning the account schema.

## Tournament roles

- `OWNER`: full control.
- `ORGANIZATION_ADMIN`: organization-level administration.
- `TOURNAMENT_DIRECTOR`: full tournament operation.
- `STAFF`: broad operational access.
- `REFEREE`: intended for assigned-match/referee workflows.
- `SCORER`: intended for result-entry workflows.

RLS in 0.1 provides the owner/manager foundation. Narrow referee/scorer assignment policies should be added when those assignment tables and UIs are implemented.

## Anonymous spectator

For public tournaments, anonymous clients may read public tournament structure, participants, stages, matches and live set scores. They cannot directly write those tables.

## Anonymous table scoring

Anonymous score entry is exposed only through narrow `SECURITY DEFINER` RPCs and requires the shared match code. Secret hashes are not selectable by browser roles.

## Player confirmation

A tournament-scoped player code identifies a person only inside the match confirmation RPC. The code is checked against the people represented by each match side. One confirmation per side is stored.
