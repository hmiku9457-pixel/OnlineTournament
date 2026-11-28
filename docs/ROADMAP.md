# Entwicklungsstand und Freigabegrenzen

Die ursprüngliche 0.1–0.5-Roadmap beschrieb eine normalisierte Serverarchitektur. Der aktuelle Testbetrieb verwendet stattdessen versionierte, eigentümergebundene Snapshots. Maßgeblich sind die folgenden Phasen:

| Phase | Aktueller Funktionsumfang |
|---|---|
| 1 | Turniererstellung, lokale Engine, sportliche Invarianten |
| 2 | Datenbankvalidierung, Revisionskonflikte, Paarungs- und Ergebnisschutz |
| 3 | Exklusive Workspace-Lease, begrenzte und bedingte Polling-Anfragen |
| 4 | Turnierleitung, Zuweisung, Abschlusskontrolle, Ergebniskorrektur |
| 5 | Private Spielerlinks, QR, persönliche Ranglisten, Aufrufe, Ergebnisvorschläge |
| 6 | Freiwillige Zuschauerprojektionen, Hallenanzeige, Phasenfilter |
| 7 | Eigentümerisolation, Speicherbelege, Checkpoints, lokale Notfallwiederherstellung |
| 8 | Reproduzierbare Turniersimulationen, Browser- und SQL-Integration, parallele Testdatenbank-Lesezugriffe |
| 9 | Dokumentierte Abnahme, CI-Gates, Betriebsgrenzen und reale Pilotprüfung |
| 10 | Unabhängige Gruppen-/Ligapaarungen, Schutz vor falschen Spielidentitäten, begrenzte wirksame Spieleränderungen |
| 11 | Betriebsdiagnose, bestätigte Sicherung direkt aus Turnierleitung, optional verschlüsselte externe Sicherung |
| 12 | Regressionen, Performanceprüfung und Fehlerbehandlung |

Eine Implementierung gilt erst nach erfolgreicher CI als automatisch geprüft. Ein grüner Build ist keine Freigabe für echte Veranstaltungen. Die reale Pilotprüfung ist gesondert durchzuführen (siehe [Abnahme](ONLINE_ACCEPTANCE_TEST.md)).

## Nicht Teil der aktuellen Freigabe
- Mehrere Bearbeiterkonten und fein abgestufte Schiedsrichter-/Helferrollen.
- Vollständige serverseitige Turnierengine statt Snapshot-Validierung.
- Hintergrund-Push, echte Offline-Synchronisierung und produktive Lastgarantien.
- Automatischer Rollback auf alte Online-Revisionen (würde abhängige Spielstände gefährden).
