# Changelog

## Unreleased

- Replace table-count input with quick-select buttons for 1–12 tables plus an explicit Custom option for larger events.
- Replace minimum-match input with quick-select buttons for 1–6 matches plus Custom.
- Centralize participant validation messages beside the add/save action while keeping invalid fields highlighted.
- Prevent duplicate player names during participant entry, including duplicate people across doubles pairs.
- Keep the participant-step Continue button disabled until at least two complete participants exist and show the requirement beside it.
- Model allowed tournament systems as independent building blocks instead of fixed combinations.
- Add recommendations for standalone Groups/Swiss and Groups → Swiss, while keeping combined recommendations as optional templates.
- Make Step 4 recommendations optional; Step 5 can now be built manually from phases.
- Expand Step 5 into a phase editor with add/remove/reorder controls, editable group counts and Swiss rounds.
- Add per-round Best-of settings for knockout stages.
- Rework participant entry into a compact editor plus a scrollable participant list with edit/remove actions and field-specific validation messages.
- Add Step 4 recommendation constraints for maximum group count, maximum Swiss rounds and knockout qualifier count.
- Allow organizers to disable individual tournament systems from the recommendation pool.
- Replace ambiguous "Top" wording in the UI with explicit qualification wording.
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
