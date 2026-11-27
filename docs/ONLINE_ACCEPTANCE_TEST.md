# Manuelle Abnahme – privater Online-Testbetrieb

Erst nach grüner CI und erfolgreichem Deployment durchführen. Kein produktives Turnier, keine echten Teilnehmerdaten nötig. Verwende vier bis acht fiktive Namen und zwei Tische. Ein Konto genügt für die Mehrgeräteprüfung; ein zweites Konto ist optional. Nicht gleichzeitig lokale und Online-Kopien als denselben Wettbewerb leiten.

## Block 1 – Anmeldung und Erstellung
- Anmelden, Verbindungstest, abmelden, erneut anmelden. E-Mail-Bestätigung nur falls erforderlich.
- Im Assistenten vier Teilnehmer, Tischtennis, Jeder-gegen-jeden, BO1, zwei Tische, online erstellen.
- Prüfen, dass das Turnier in der Online-Übersicht, nicht in der lokalen Übersicht erscheint.
- Seite neu laden und Turnier wieder öffnen.

## Block 2 – Turnierleitung
- Starten, zwei Spiele zuweisen, Ergebnis eintragen, Tisch erneut verwenden.
- Vor der abschließenden Freigabe ein Ergebnis korrigieren, Tabellenstand prüfen.
- Ein Spiel auf anderen Tisch verschieben; Pause starten und beenden.
- Alle Spiele abschließen, Abschlusskontrolle freigeben, Endstand prüfen.

## Block 3 – Zweites Fenster / Störung
- Ein weiteres Online-Turnier anlegen. Mit demselben Konto in anderem Browser öffnen.
- In Browser A eine Änderung speichern. In B Datenbankstand prüfen; Bearbeitung muss gesperrt werden.
- B neu laden; Änderung muss sichtbar sein. Keine unbemerkte Überschreibung.
- Netzwerk im Browser deaktivieren; Bearbeitung muss gesperrt werden. Wieder verbinden.
- Bei einer unklaren Speicherung: Wiederholen, JSON sichern oder nach Prüfung verwerfen. Keinen Datenstand blind überschreiben.

## Block 4 – Komplexe Formate
- Schweizer System mit 4–8 Teilnehmern und 2–3 Runden. Jede Runde bestätigen; Paarungen, Wertung und Runde prüfen.
- Gruppen mit nachfolgendem KO (8 Teilnehmer, 2 Gruppen, 4 Qualifikanten); nach Phasenfreigabe Ergebnis korrigieren, solange die Folgephase noch nicht gestartet wurde. Nach Start der Folgephase muss die Korrektur gesperrt sein.
- Mehrtägiges Turnier mit Spieltagswechsel; Pause, Neustart des Browsers und Fortsetzung prüfen.

## Block 5 – Sicherungen / Trennung
- Wiederherstellungspunkte eines Online-Turniers herunterladen; aktive Revision darf sich dabei nicht ändern.
- Ein separates lokales Turnier erstellen und abschließen, ohne angemeldet zu sein.
- JSON-Sicherung eines lokalen Turniers in einem frischen Browser wiederherstellen. Keine fremden Turnierdaten übernehmen.
- Optional: anderes Konto verwenden; ursprüngliche Online-Turniere und Sicherungen dürfen nicht angezeigt werden.

## Abnahmekriterien
Kein Datenverlust, keine fremden Daten, keine Doppelbuchung, keine unbemerkte Konfliktüberschreibung, korrekte Turnierstände nach Reload. Bei einem Fehler Test stoppen und Screenshot/Browser/Schritt notieren. Testdaten nicht für echte Veranstaltungen verwenden.

## Noch nicht freigegeben
Der Online-Modus ist ein privater Testbetrieb mit versionierten Snapshots. Keine vollständige serverseitige Neuberechnung aller Paarungen, Qualifikationen oder Sonderentscheidungen, kein verteiltes Bearbeitungslease, keine öffentlichen Spieler-/Zuschaueransichten. Die IndexedDB-Wiederherstellung schützt vor normalen Browserneustarts, nicht vor Löschung des Browserprofils oder Verlust des Geräts.

## Erste Kurzabnahme
Für den Einstieg reicht Block 1 und ein kleiner Ausschnitt von Block 2: ein Online-Turnier mit vier fiktiven Spielern erstellen, starten, ein Ergebnis speichern, über „Arbeitsbereich neu laden“ neu laden, Ergebnis und Tabelle prüfen. Die Anmeldung muss erstmals mit dem echten Supabase-Konto durch den Anwender bestätigt werden. Erst danach die übrigen Testblöcke durchführen. Vor dem Test prüfen, dass die GitHub-Pages-Auslieferung den gewünschten Commit enthält.

## Versionsanzeige
Links unten auf jeder Ansicht steht `v0.1.0 · Build <Nummer> · <Commit>` beim GitHub-Pages-Deployment. Der Commit ist der tatsächlich ausgelieferte Build-Stand und nicht der aktuelle Stand eines Branches. Bei einem Fehler bitte diese Angabe mitliefern. Vite-Entwicklungsserver zeigen `Dev` statt `Build`.

## Exklusive Bearbeitungssperre
Block 3 entsprechend aktualisieren: Browser B muss zunächst die Sperrseite anzeigen. Browser A gibt die Bearbeitung über den Button frei, danach kann B das Turnier öffnen und weiterleiten. Nach einem Absturz darf die Sperre nach spätestens 90 Sekunden seit letzter Verlängerung ablaufen. B darf A nicht gewaltsam verdrängen. Eine alte Anwendung darf nach Verlust der Sperre keine weiteren Ergebnisse speichern.

Zum normalen Neuladen die Schaltfläche „Arbeitsbereich neu laden“ verwenden, die die Sperre vorher freigibt.
