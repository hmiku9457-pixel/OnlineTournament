# Abnahmecheckliste: Turniererstellung

Ziel: Alle fünf Schritte nach der abschließenden Überarbeitung einmal mit echten Klicks durchspielen. Abweichungen mit Screenshot, Eingaben und dem betroffenen Schritt dokumentieren.

## Vorbereitung

- Browser mit freiem Local Storage im normalen Modus verwenden.
- Entwicklungsserver und Browser-Konsole öffnen.
- Mindestens einmal `npm run build`, `npm run test` und `npm run lint` ausführen.
- Zusätzlich am Smartphone oder im schmalen Browserfenster prüfen.

## 1. Grunddaten
- [ ] Pflichtfelder verhindern „Weiter“ bei leeren Angaben.
- [ ] Turnierdatum über Kalenderdialog auswählen, Uhrzeit über Uhrzeitdialog.
- [ ] Sportart ändern; Wettbewerbsarten und Zeitwerte passen sich an.
- [ ] Zwischen Einzel, Doppel und Mannschaften wechseln; vorhandene Teilnehmer werden nicht ohne Warnung unbrauchbar.
- [ ] Ein Wettkampf mit matchbasierter Spieldauer verlangt eine positive ganze Zahl.
- [ ] Hallenplan aktivieren, Raster verändern, Tische und Leitung platzieren; danach Seitenwechsel und Neuladen.

## 2. Teilnehmer
- [ ] Mindestens zwei Teilnehmer erforderlich.
- [ ] Doppelter Vor-/Nachname sowie mehrfach verwendete Doppelpartner werden abgelehnt.
- [ ] Teilnehmer hinzufügen, bearbeiten und löschen.
- [ ] Bearbeitung beginnen, aber nicht speichern: Wechsel über Schrittanzeige und über „Weiter“ muss vor Datenverlust warnen.
- [ ] „Abbrechen“ verwirft nur ungespeicherte Formulardaten.
- [ ] Wiederherstellung nach Neuladen: Teilnehmerliste, Bearbeitungsmaske und Einträge sind korrekt.
- [ ] Nach dem Neuladen neuen Teilnehmer hinzufügen: keine identischen internen IDs/React-Key-Warnungen.

## 3. Turnierform
- [ ] Empfehlungen für kleine (2, 3, 4) und große (19, 24) Teilnehmerfelder prüfen.
- [ ] Schätzzeiten gegen denselben Phasenplan in Schritt 4 vergleichen (sportabhängiges Best-of).
- [ ] Vorgaben begrenzen nur Vorschläge; Deaktivieren von „Schweizer System“ darf keine bereits manuell konfigurierte Schweizer Phase entfernen.
- [ ] Empfehlung auswählen, anpassen und später in Schritt 3 zurückkehren: manuelle Änderungen bleiben erhalten.

## 4. Phasen
- [ ] Gruppenphase mit zwei oder drei Teilnehmern nicht zulassen.
- [ ] K.-o.-Phase nur am Ende, Freilose und rundenabhängiges Best-of prüfen.
- [ ] Schweizer Runden nicht über `min(30, Teilnehmerzahl - 1)` erlauben, auch wenn Teilnehmer später reduziert werden.
- [ ] Einfügen, Verschieben und Löschen darf Qualifikationsgrenzen nicht ungültig lassen.
- [ ] Nach Zwischenpause bei der Weiterkommenden-Zahl die letzte Spielphase statt der Pause nennen.
- [ ] Zwischenpausen in Schweizer/K.-o.-Runden ein- und ausschalten, Zeiten wechseln, Daten nach Neuladen prüfen.
- [ ] „Pause für X Minuten“, „Pause bis HH:MM“ und Spieltagswechsel auf späteres Datum testen.
- [ ] Unmögliche Fortsetzungstermine erzeugen einen verständlichen Fehler und blockieren die Erstellung.
- [ ] Pausenhinweise erscheinen später im öffentlichen Zeitplan.

## 5. Zusammenfassung und Abschluss
- [ ] Keine rechte Zusammenfassung; alle Daten kompakt im Hauptbereich.
- [ ] Passende Spielerzahl, Gruppen/Runden, Qualifikationsplätze, aktive Spielzeit und echte Pausen.
- [ ] Mehrtägige Unterbrechungen dürfen **nicht** als 40-/60-Stunden-Pausen in der aktiven Gesamtdauer auftauchen.
- [ ] Turnierende und Siegerehrung korrekt; Siegerehrung darf nicht vor Turnierende beginnen.
- [ ] „Zurück“ und grüner „Turnier erstellen“-Button oben sichtbar und auf Mobilgeräten erreichbar.
- [ ] Bei absichtlich vollem/gesperrtem Browser-Speicher wird ein Fehler angezeigt.
- [ ] Nach erfolgreichem Erstellen öffnet sich die Turnierleitung und alle Werte sind gespeichert.
- [ ] Der gespeicherte Entwurf ist nach erfolgreicher Erstellung gelöscht.

## Entwurfswiederherstellung
- [ ] In Schritt 4 mit Teilnehmern und Phasen neu laden: exakt dieselben Eingaben und derselbe Schritt.
- [ ] Browser schließen und später erneut öffnen: Entwurf wird geladen.
- [ ] „Entwurf verwerfen“ mit Abbrechen und mit Bestätigen prüfen.
- [ ] Local Storage verweigern/limitieren: Warnung statt stillschweigender falscher Speicherzusage.

## Abschlusskriterien
- Keine Build-, Lint- oder Testfehler.
- Keine Fehler in der Browser-Konsole.
- Keine unerwarteten Datenverluste oder doppelten Teilnehmer.
- Mindestens ein Testturnier: Gruppen → Pause → Schweizer System → Spieltagswechsel → K.-o. mit Siegerehrung.
- Mindestens ein weiteres Turnier mit einer anderen Sportart und Wettbewerbsart.
