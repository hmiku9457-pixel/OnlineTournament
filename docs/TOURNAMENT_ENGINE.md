# Tournament Engine

The engine must stay deterministic and UI-independent.

## Stage pipeline

Example:

1. SWISS – 5 rounds
2. KNOCKOUT – Top 8
3. PLACEMENT – optional places 5–8

A stage receives participants and produces rankings/qualifiers for the next stage. Advancement is automatic by default but may be manually overridden by authorized staff, e.g. after a withdrawal.

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
