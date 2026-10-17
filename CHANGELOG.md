## 0.1.2
- Behoben: Wizard kann Schritt 5 nicht mehr durch einen Formular-Submit in Schritt 4 überspringen.
- Verbessert: Ergebniseingabe berücksichtigt Best-of und nutzt Kurznotation pro Satz (7 = 11:7, -7 = 7:11).
- Verbessert: Spiele werden nach abgeschlossener Satzeingabe im lokalen Prototyp-State als beendet gespeichert.
- Verbessert: Zurück-Navigation in Turnierdetail, Turnierleitung, Spieler-, Zuschauer- und Scoring-Ansicht.
- Überarbeitet: Turnierleitungs-Übersicht zeigt alle Tische, Pausenzeiten und direkte Ergebniseingabe.
- Neu: Turnierverlauf mit Gruppentabellen/-spielen, Schweizer Rangliste und K.-o.-Baum.
- Überarbeitet: Teilnehmeraktionen Daten bearbeiten, Spielübersicht und Zurückziehen.
- Überarbeitet: Zuschaueransicht zeigt Tabellen und Turnierbäume.

## 0.2.0 - DB-loser UX-Prototyp

- Turnier erstellen speichert den fertigen Wizard lokal im Browser (`localStorage`) und öffnet das neu erzeugte Turnier.
- Turnier öffnen führt in eine klickbare Turnierleitungsoberfläche mit Übersicht, Spielen, Teilnehmern, Phasen und Tischen.
- Turniere können im Prototyp gestartet, pausiert und fortgesetzt werden.
- Neue eigenständige Spieleransicht mit aktuellem/nächstem Spiel, Spieler- und Match-Code.
- Zuschaueransicht verwendet den gewählten Demo-/lokalen Turnierdatensatz und zeigt Live- sowie nächste Spiele.
- Tablet-Ergebniseingabe wurde als eigenständige Oberfläche erweitert und zeigt Matchdaten aus dem Mock-Laufzeitmodell.
- Lokale Testturniere können im Dashboard zurückgesetzt werden.
- Spieler- und Zuschaueransichten laufen bewusst ohne Verwaltungs-Sidebar.


## 0.1.1
- Hinzugefügt: großer Demo-/Testpool mit aktiven Turnieren für die grafische Beurteilung verschiedener Turnierformen.
- Verbessert: Dashboard zeigt mehrere aktive Beispielturniere mit unterschiedlichen Formaten.
- Verbessert: Turnierdetailseite liest Demo-Turniere dynamisch nach ID und zeigt reichhaltigere Phaseninformationen.

# Changelog

## Unreleased

- Add per-phase match counts and rough phase durations to the right-hand Step 5 flow summary.
- Add participant-aware Swiss round recommendations and a rough leading score distribution to Swiss phase descriptions.
- Show the number of first-round byes directly in knockout phase descriptions.
- Compact Step 4 recommendation cards so the wizard footer remains visible more often without scrolling; secondary estimate text now uses tighter spacing and smaller typography.
- Add a phase-type “Ändern” control in Step 5; knockout and double-elimination can only be selected when editing the final phase.
- Keep knockout participant entry in Custom mode even when the custom value equals a preset such as 2, 4, 8 or 16.
- Move the Step 5 summary into a sticky right-hand column and render phases vertically with arrows that show how many participants advance to the next phase.

- Remove the redundant "Diese Anzahl startet in Phase X" helper text from follow-up phase configuration.
- Add a rough tournament duration estimate to the Step 5 summary using configured phases, entrants, Best-of settings, knockout round settings, available tables, and an assumption of 15 minutes per set.

- Render Custom numeric inputs inside the same button grid so they match preset-button sizing; table Custom sits below 7 and minimum-match presets now use 1–5 plus Custom.
- Add a 15-minute-per-set baseline duration model to format recommendations and suppress suggestions above roughly 3.5 hours for the available table count.
- Make knockout and double-elimination stages terminal so no later phase can be added or reordered behind them.
- Require an explicit advancing-participant count for every phase after Phase 1.
- Add knockout participant quick-selects for 2/4/8/16/32/64, limited to the number available from the previous phase, plus Custom.
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
