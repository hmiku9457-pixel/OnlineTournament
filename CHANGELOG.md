# Changelog

## Unreleased

- Rework tournament creation into a five-step wizard: basic data → participants → match requirements → format recommendation → per-phase Best-of.
- Derive participant count from entered singles players or doubles pairs instead of requiring it up front.
- Add Best-of-1 and make Best-of a stage-level setting.
- Fix tournament format ranking so Swiss → K.-o. is the primary recommendation for larger fields while Groups → K.-o. remains available as an alternative.

## 0.1.0 - 2026-10-17

- Initial architecture and repository foundation.
- Stage-based tournament model.
- Supabase schema/RLS/RPC foundation.
- Live set scoring and two-sided player confirmation model.
- Tournament engines and responsive UI shell.
