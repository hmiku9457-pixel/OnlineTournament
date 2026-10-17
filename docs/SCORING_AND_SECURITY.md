# Scoring & security model

## Match code

Each match has a short shared code. Entering this code unlocks set-by-set scoring for that single match. The code is stored only as a hash.

`submit_match_set` verifies the code and allows live set updates while the tournament is running/paused.

## Player code

Each person receives a tournament-scoped player code. After the match, one valid player code from each side confirms the result.

For doubles, one of the two players on each team is sufficient.

## State model

- `SCHEDULED`: not started.
- `LIVE`: at least one set was entered.
- `FINISHED`: score complete, waiting for both sides.
- `CONFIRMED`: both sides confirmed; standings may update.
- `WALKOVER`: administratively resolved without normal scoring.

`finish_match_with_code` validates every completed set against the configured point target/win-by rule, detects the unique match winner and moves the match to `FINISHED` atomically. Any later score edit clears finalization and confirmations, requiring the result to be finalized and confirmed again.

## Production hardening backlog

- Rate-limit anonymous code verification and score RPCs.
- Add failed-code attempt logging / temporary lockouts.
- Create short-code generator RPCs so plaintext codes exist only once during creation.
- Add audit events to every privileged correction.
- Consider rotating a match code when a match is reset.
