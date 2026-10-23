## UI: Spielerhistorie und Teilnehmerstatistik (24.10.2026)

- Die Schweizer Spielerhistorie trennt Gegnerbilanz **vor** der Runde und tatsächliches Partieergebnis in eindeutig beschriftete Spalten. Das doppelte „vs.“ hinter den Gegnernamen entfällt.
- Spielausgänge und Satzergebnisse stehen in einheitlich ausgerichteten Spalten; Sieg/Niederlage/Offen bleiben farblich gekennzeichnet, Details bleiben anklickbar.
- Teilnehmerverwaltung: vier kompakte Kennzahlen (Gesamt, noch im Turnier, ausgeschieden, zurückgezogen) direkt oberhalb der Teilnehmerliste.
- Teilnehmerstatistik aus dem tatsächlichen Teilnehmerstatus abgeleitet; Regressionstests für verschiedene Statuskombinationen ergänzt.

## UX-Korrekturen – 23.10.2026 (Spielerpartien & K.-o.)
- Teilnehmerliste vertikal kompakter (Zeilenhöhe, Code und Aktionsbuttons).
- Nach einem sportlichen Ausscheiden aus der K.-o.-Phase ist ein Rückzug nicht mehr möglich; die Regel gilt auch im Runtime-Service. Halbfinalverlierer bleiben für ein offenes Spiel um Platz 3 teilnahmeberechtigt.
- Das Spiel um Platz 3 steht innerhalb der Finalspalte direkt unter dem Finale, in Turnierleitung und Zuschaueransicht.
- Spieler-Partien nutzen einheitliche Ergebnisspalten aus eigener Perspektive; Sieg = grün, Niederlage = rot, Offen = blau.
- Regressionstests für Gast-Ergebnisdarstellung und Rückzugssperre.

## UI-Korrektur: einheitliche Teilnehmeraktionen und Satz-Korrekturtabelle (2026-10-23)
- Teilnehmeraktionen erhalten in jeder Zeile identische feste Spaltenbreiten (mobil responsiv).
- Das Ergebnis-Korrekturmodal zeigt Satznummer, bisheriges Satzergebnis und ein zunächst leeres Eingabefeld je Satz.
- Leere Eingabefelder behalten den bisherigen Satz; nur ausgefüllte Felder überschreiben ihn.
- Hauptaktion des Modals heißt „Ergebnisse korrigieren“ und steht im Footer.

## UI-Korrektur: Satzergebnisse im Modal und kompakte Tischkarten (2026-10-23)

- Vorläufige Ergebnisse: Korrektur der bisherigen Sätze im Modal; erst "Korrektur speichern" übernimmt die Anpassung.
- Satzergebnisse bleiben direkt anklickbar und öffnen denselben Korrekturdialog.
- Tischkarten: Bestätigungsaktionen in einer kompakten zweispaltigen Zeile; Tischwechsel-/Zuweisungsaktionen werden während der Endbestätigung nicht mehr im Layout reserviert.

## Unreleased – Turnierleitungs-UX (23.10.2026)

- Nicht mögliche Rückzüge und die Rückzugssperre für ausgeschiedene Teilnehmer erscheinen als deaktivierte, optisch buttonartige Elemente.
- Das Spiel um Platz 3 wird in Turnierleitung und Zuschaueransicht unterhalb des Finales in derselben K.-o.-Spalte angezeigt.
- Bereits bestätigte Sätze lassen sich durch Klick auf das Satzergebnis korrigieren; der separate „Ändern“-Link entfällt.
- Der vorläufige Endstand zeigt nur „Vorläufiges Ergebnis“ mit „Endergebnis bestätigen“ und „Ergebnis korrigieren“ nebeneinander.
- Tischwechsel und Aufheben der Zuweisung sind während der Endbestätigung unsichtbar, ohne die Kartenhöhe durch Entfernen der Aktionszeile zu verändern.
- Die Tabs „Teilnehmer“ und „Spiele“ haben ihre Reihenfolge getauscht.

## Unreleased – Tischwechselzeit und Schweizer Ergebnisbestätigung

- Veralteten Turnover-Regressionstest korrigiert: Die 5-minütige Wechselzeit blockiert keinen freien Tisch; der Test prüft nun die sofort mögliche Zuweisung.

- Die eingestellte Wechselzeit zwischen Spielen auf demselben Platz fließt weiterhin in die Planung ein, sperrt aber keine Tischzuweisung mehr.
- Schweizer System: Bei Eingabe durch die Turnierleitung ist das Endergebnis ausdrücklich zu bestätigen, auch bei Best-of-1. Bis dahin bleibt das Match offen.
- Diese Admin-Bestätigung markiert das Schweizer Ergebnis als bestätigt. Von Spielern eingetragene und über beide Spielercodes bestätigte Ergebnisse benötigen keine zusätzliche Bestätigung durch die Turnierleitung.
- Regressionstests für beide Abläufe ergänzt.

## 0.1.0 – Turnierleitungs-UX und Spieldaten (20.10.2026)

- Hallenlayout: funktionslosen „Freies Feld“-Button entfernt; die „Freifläche setzen“-Funktion lässt sich auf einem markierten Feld erneut anklicken, um es zu leeren. Raster horizontal zentriert. Außenposition der Turnierleitung direkt neben Spalten/Reihen und „Tische in eine Reihe“ neben „Turnierleitung im Raster“.
- Spieldaten: Tischtennis besitzt eine feste Satzdauer von 15 Minuten. Fußball, Handball und Basketball erlauben eine verpflichtende, zunächst leere Spieldauer und eine optionale Platzpause zwischen Spielen. Die Werte werden im lokalen Turnier gespeichert und bei zeitbasierten Sportarten in Vorschlägen, Phasenschätzungen, Restdauer und Tischzuweisung berücksichtigt.
- Spiele: Vor Beginn der ersten Phase ist die Spielliste leer und erklärt, wann die Paarungen sichtbar werden.
- Rückzug: Rückgängigmachen nur vor dem ersten Start bzw. nach Qualifikation und vor dem Start der Folgephase; ein Rückzug während einer laufenden Runde bleibt endgültig. Wiederaufnahme wird im lokalen Audit-Log dokumentiert.
- Turnierleitung: „Ergebnis anzeigen“ ist ein Button, der die interne Verwaltungsmaske statt der Spieler-/Tablet-Ansicht öffnet; bereits gesperrte historische Ergebnisse bleiben lesbar.
- Satzweise Ergebniseingabe: BO1 bleibt ein direkter Spielabschluss; BO3/5/7 verlangt nach dem entscheidenden Satz eine zusätzliche Bestätigung des kompletten Endergebnisses. Bis dahin bleibt das Spiel LIVE und alle bisherigen Sätze können korrigiert werden.
- Regressionstests ergänzt: Vorab-Rückzüge, Wiederaufnahme zwischen Phasen, BO-Endbestätigung und zeitbasierte Platzwechsel.

## Unreleased – Turnierleitung: Zuweisung, Bestätigungen und Betrieb

- Laufende Spiele können auf einen freien Tisch verlegt oder mitsamt vorhandener Sätze in die Warteschlange zurückgestellt werden. Der ursprüngliche Startzeitpunkt und der Pausenwert bleiben erhalten.
- Während einer Turnierpause verbietet die gemeinsame Runtime jegliche neue Zuweisung (Button, Auto-Zuweisung, Drag & Drop); laufende Spiele dürfen abgeschlossen werden.
- Offene Ergebnisbestätigungen werden aus echten, gespeicherten Ergebnissen ermittelt. Tablet-Codes werden nun im lokalen Prototyp geprüft; die Turnierleitung kann ein Ergebnis selbst bestätigen.
- Neuer Protokoll-Tab für Tischaktionen, Satzspeicherung, Ergebniskorrekturen, Bestätigungen und Pause/Fortsetzen; die letzte Ergebniskorrektur kann vor dem Start der Folgephase sicher zurückgenommen werden. Audit-Akteure sind lokale Rollenbezeichnungen, keine Authentifizierung.
- Schweizer Spielerhistorie zeigt pro Runde die Gegnerbilanz **vor** der Begegnung.
- Turnierstatus, Hallenlayout und Schnellzugriff stehen als gleich breite Karten gemeinsam rechts neben den Tischen und der Warteschlange.
- Pausenzeiten werden bei Beginn einer Partie eingefroren und bleiben bei Abschluss, Navigation und Tischverlegung identisch. Für ältere Partien ohne gespeicherten Startzeitpunkt wird kein erfundener Wert angezeigt.
- Neue Regressionstests und separater Runtime-Smoke-Test für Zuweisung, Pausen, Codes, Audit und Schweizer Matchups.

## UI-Prototyp – Hallenlayout und Nachmeldungen (2026-10-20)

- Hallenlayout-Editor im ersten Erstellungsschritt standardmäßig sichtbar; ein einfacher Toggle steuert ausschließlich, ob das Layout ins Turnier übernommen wird (standardmäßig aktiviert).
- Neues Standardraster: **10 Spalten × 3 Reihen** (bei mehr als 30 Tischen automatische Erweiterung nach unten). Eine einzelne Tischreihe bleibt über den bestehenden Button möglich.
- Vor dem ersten Turnierstart lassen sich in der Teilnehmerverwaltung Spieler beziehungsweise Doppelpaare nachtragen; Pflichtfelder, Dubletten und Spielercode werden geprüft.
- Vor dem ersten Start verschwinden zurückgezogene Teilnehmer aus Gruppen-, Schweizer- und K.-o.-Auslosungen sowie aus den ungespielten Paarungen; sie bleiben als „Zurückgezogen“ im Teilnehmerverzeichnis dokumentiert.
- Bereits bearbeitete Gruppen- und K.-o.-Verteilungen werden bei Teilnehmeränderungen abgeglichen; ungültig gewordene K.-o.-Pins werden entfernt.
- Neue Regressionstests für Vorstart-Rückzug, Nachmeldungen (Einzel/Doppel), Pins und Standardlayout.

## UI-Prototyp – Endplatzierungen & Hallenlayout (2026-10-18)

- Neuer Tab **Endplatzierungen** für beendete Turniere. Ergebnisse stammen aus der bestehenden Platzierungslogik, gruppenbezogene Platzierungen bleiben als solche markiert.
- Nicht mehr auswählbar: Doppel-K.-o. und Platzierungs-/Trostrunde (bisherige lokale Testdaten werden weiterhin lesbar gehalten).
- In den Grunddaten kann optional ein Hallenlayout eingerichtet werden: Tische verschieben/tauschen, Freiflächen und Turnierleitung im/außerhalb des Rasters.
- Das Hallenlayout wird im lokalen Turnierdatensatz gespeichert und bei der Turnierleitung rechts in der Übersicht angezeigt.

## Prototyp-Update – Teilnehmerplatzierungen und Spiel um Platz 3

- Teilnehmerstatus im Verwaltungs-Tab berücksichtigt den Start der Folgephase; ausgeschiedene Spieler erscheinen nicht mehr als aktiv.
- Endplatzierungen werden aus Gruppen-Ranglisten, Schweizer-Ranglisten bzw. den tatsächlich gespielten K.-o.-Runden berechnet (z. B. Gruppe A · Platz 3, Platz 5–8).
- Einfache K.-o.-Phasen mit mindestens vier Teilnehmern erhalten automatisch ein Spiel um Platz 3 mit den beiden Halbfinalverlierern.
- In der Turnierleitungs-Übersicht kann das Bronze-Spiel per gesondertem Button nicht ausgetragen werden; beide Teilnehmer erhalten dann Platz 3, es gibt keinen vierten Platz.
- Die Phase bleibt offen, bis das Bronze-Spiel gespielt oder bewusst ausgelassen wurde; sowohl Turnierverlauf als auch Zuschauerbaum zeigen die Wertung.
- Entfernt: redundante Sieg:Niederlage-Angabe neben dem Namen in Schweizer Tabellen (die Tabellenspalten zeigen sie bereits).
- Neue Regressionstests für Gruppen-Ausscheiden, Bronze-Austragung und gemeinsames Platz-3-Ergebnis.

## Unreleased – UI/UX Turnierleitung (18.10.2026)
- Teilnehmerstatus steht direkt neben dem Namen; kompaktere Zeilen.
- Rückzüge werden in Gruppen- und Schweizer Tabellen sowie in der Zuschaueransicht gekennzeichnet.
- Vertikale Tabellenabstände reduziert.
- Schweizer Spielerpartien erhalten einheitliche Resultat-Zeilen für Sieg und Niederlage.
- Die Pausenzeit basiert auf dem Abschlusszeitpunkt der tatsächlich gespielten Partie statt auf einer zufälligen Mock-Zahl und aktualisiert sich automatisch; kampflose Wertungen zählen nicht als Spielzeit.
- Regressionstests für Pausenzeiten und Erstspiel-Anzeige ergänzt.

## Unreleased – Tischverwaltung und Restzeit (UX)

- Im Turnierverlauf schmalere Gruppenkarten und kompaktere Spielernamenspalten der Spieltage.
- Restzeit in der Turnierleitung wird aus offenen Spielen und Sätzen sowie den konfigurierten Best-ofs und freien, nicht gesperrten Tischen berechnet und nach bestätigten Ergebnissen aktualisiert.
- Pro Tisch gibt es „Sperren“/„Freigeben“; die Sperre bleibt im lokalen Testmodus beim Neuladen erhalten und verhindert jede neue Zuweisung auf diesem Tisch.
- Ein bereits laufendes Spiel kann an einem anschließend gesperrten Tisch regulär beendet werden.
- Regressionstests für Zuweisungssperren und sinkende Restzeit ergänzt.

## Build-Korrektur (18.10.2026)
- Fehlenden `StageCard`-Import in `TournamentControlPage.tsx` ergänzt; behebt `TS2304` beim Build.

## UX / Qualifikations-Fixes (18.10.2026)
- Gruppenkarten verbreitert, Tabellen ohne horizontales Scrollen auf Desktop und Spieltage zweispaltig.
- Spieler-Partien aus der jeweiligen Spielerperspektive dargestellt, einschließlich Satzdetail-Popup.
- Ergebnisdetails in zentrierter Zweispaltenansicht; „W.O.“ durch „Kampflos“ mit Erläuterung ersetzt.
- Rückzug qualifizierter Spieler nach dem Abschluss einer Phase berechnet Nachrücker neu, bis die Folgephase startet.
- Unbenutzten Tab „Phasen“ aus der Turnierleitung entfernt.

## Korrekturen – 18.10.2026

- K.-o.-Zufallsverteilung: Freilose behalten ihre bestehenden Slots; nur nicht angepinnte Spieler werden neu gemischt.
- K.-o.-Pins: Die blaue Hervorhebung gilt nur für fixierte Plätze der bearbeitbaren ersten Runde, nicht für gleich nummerierte Plätze in späteren Runden.
- Rückzug in einer laufenden Gruppen-/Jeder-gegen-jeden-Phase: Auch bereits abgeschlossene Partien werden rückwirkend in Satzniederlagen zu je 0:11 umgewertet (Anzahl Sätze gemäß Best-of). Die Gruppen-Tabelle berechnet Satz- und Ballwerte entsprechend neu. Automatisch gewertete Partien sind nicht manuell überschreibbar.
- Satz-Kurznotation: `-0` wird als `0:11` erkannt; `0` und `+0` bleiben `11:0`.
- Regressionstests für Freilospositionen, Pins, rückwirkende Gruppenergebnisse und Kurznotation ergänzt.

# UI/UX und Mock-Runtime – 2026-10-18

- K.-o.-Startplätze können einzeln mit einem Pin fixiert werden; Zufallsverteilung mischt nur die übrigen Teilnehmer/Freilose unter Einhaltung der Bracket-Constraints.
- K.-o.-Turnierbaum zeigt bei abgeschlossenen Spielen Ballpunkte aller Sätze und den Satz-Endstand je Teilnehmer.
- Schweizer Rangliste in Turnierleitung und Zuschaueransicht öffnet per Klick alle Partien des Spielers.
- Tischkarten besitzen eine höhere Mindestbreite und verhindern das Überlaufen von Status und Satzerfassung.
- Fertige Match-Ergebnisse sind nach Start der Folgephase sowohl im UI als auch in der lokalen Runtime nicht mehr änderbar.
- Rückzüge werden lokal gespeichert: offene Partien werden als kampflose Ergebnisse gewertet; neue Schweizer Runden lassen Zurückgezogene aus und verteilen Freilose möglichst an Teilnehmer ohne voriges Freilos.
- Teilnehmereditor bietet Vorname, Nachname und Spielercode. Namensänderungen aktualisieren lokale Auslosungsreferenzen.
- Teilnehmer-Spielübersicht listet echte Partien mit Status, Ergebnis und zulässiger Admin-Bearbeitung.
- Neue Regressionstests für Pins, Rückzug und Ergebnissperre.

- Fix: K.-o.-Best-of-Regressionstest prüft jetzt den vollständigen Turnierbaum statt nur aktuell spielbare Matches.
## 0.2.2 - Turnierverlauf UX & Schweizer Pairing

- Gruppen: Teilnehmer in der Tabelle sind anklickbar und öffnen alle Partien des Spielers.
- Gruppen: Ergebnishover zeigt die exakten Satzergebnisse.
- Folgephasen: Teilnehmer zeigen ihre Platzierung aus der vorherigen Phase, z. B. „Gruppe A - 1.“.
- Schweizer System: neue Zufallsreihenfolge vor dem Phasenstart.
- Schweizer System: aktuelle Sieg:Niederlage-Bilanz wird an Teilnehmernamen in Rangliste, Paarungen, Spieler-, Zuschauer- und Scoring-Ansicht angezeigt.
- Schweizer Pairing: Paarungen werden nach Scoregruppen erzeugt; nur notwendige Floats zwischen benachbarten Scoregruppen werden zugelassen und Wiederholungsgegner möglichst vermieden.
- Schweizer Freilose zählen konsistent als Sieg für Pairing und angezeigten Record.

## 0.1.5
- Verhindert: Teilnehmer können nicht gleichzeitig zwei belegten/zugewiesenen Tischen zugeordnet werden.
- Verbessert: Direkte Ergebniseingabe in der Turnierleitung zeigt für Best-of-3/5/7 ein separates Feld pro Satz.
- Hinzugefügt: Jeder Eintrag unter „Nächste Spiele“ besitzt eine eigene automatische Tischzuweisung.

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

- Spielerpartien im Schweizer System: Gegnerbilanz als Tag unmittelbar hinter dem Namen (auch in der Zuschaueransicht).
- Spielerbezogene Match-Ergebnisse und Satzdetails werden konsistent aus Sicht des ausgewählten Teilnehmers aus den gespeicherten Satzpunkten berechnet; der Endstandstext ist nicht länger die alleinige Quelle.
- Regressionstests für linke/rechte Matchseite, Ergebnisumkehr, veralteten Ergebnistext und noch offene Spiele ergänzt.

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
