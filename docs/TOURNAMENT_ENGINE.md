# Tournament Engine

The engine must stay deterministic and UI-independent.

## Stage pipeline

Example:

1. SWISS – 5 rounds
2. KNOCKOUT – 8 Qualifizierte

A stage receives participants and produces rankings/qualifiers for the next stage. Every stage after Phase 1 has an explicit entrant/qualification count. Advancement is automatic by default but may be manually overridden by authorized staff, e.g. after a withdrawal. Single- and double-elimination stages are terminal: no later stage may follow them.

## Recommendation workload model

Automatic suggestions are intentionally conservative. The baseline assumes 15 minutes per set and at least one set per match, accounts for the available table count, and suppresses formats above roughly 210 baseline minutes. Best-of settings are configured later, so the displayed duration is a lower-bound planning estimate rather than a promised finish time. Organizers may still build longer formats manually.

## Table tennis standings

Current default order:

1. Wins
2. Set difference
3. Sets won
4. Buchholz

Buchholz is mainly useful for Swiss stages. The engine keeps tie-breakers stage-aware so a future UI can configure different sequences.

## Swiss

The initial implementation is a deterministic greedy pairer:

- rankings first,
- previous meetings avoided where possible,
- repeated byes avoided where possible.

Before production use at scale, extend it with score groups, color/side balancing if a sport needs it, and a full backtracking optimizer.

## Knockout

The first-round generator preserves seeding as its primary objective. It then attempts local swaps to avoid:

- previous opponents,
- players from the same source group.

## Withdrawal

- confirmed history remains unchanged;
- future matches are walkovers;
- a bye against a withdrawn player is cancelled instead of propagated as a meaningless double-bye.
