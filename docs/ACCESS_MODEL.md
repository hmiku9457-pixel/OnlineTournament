# Zugriffsmodell – aktueller Online-Testbetrieb

- Lokale Turniere: browserlokaler IndexedDB-Speicher; kein Konto erforderlich.
- Online-Turniere: nicht-anonymer authentifizierter Eigentümer, exklusive erneuerbare Bearbeitungssperre (90 Sekunden), Revisionsvergleich und exakte Operation-ID für Schreibzugriffe.
- Spieler: widerrufbarer persönlicher Link, nur eigene Spiele, Status, Aufrufe und Ergebnismeldungen. Keine direkte Änderung der offiziellen Wertung. Die Turnierleitung übernimmt Meldungen ausdrücklich.
- Zuschauer: widerrufbarer nicht gelisteter Link. Standardmäßig aggregierter Fortschritt; Namen, Spielstände, Tabellen und KO-Bäume nur nach separater Freigabe.
- Sicherungen und Wiederherstellungspunkte: ausschließlich Eigentümer; historische Stände werden nicht blind auf die aktive Online-Revision zurückgeschrieben. Lokale Wiederherstellung überschreibt kein bestehendes lokales Turnier.
- Der Datenbankzugriff läuft über eng begrenzte RPCs; private Tabellen sind nicht direkt für Browserrollen lesbar. Widerruf wird bei der nächsten erfolgreichen Prüfung sichtbar. Persönliche Links sind Zugangsschlüssel und dürfen nicht öffentlich geteilt werden.

## Nicht freigegeben / nicht implementiert
Mehrere unabhängige Turnierleiterkonten, Organisationen, zugewiesene Schiedsrichter- oder Helferrollen, Hintergrund-Push, direkte Realtime-Freigabe privater Daten sowie echte Offline-Synchronisierung sind keine Fähigkeiten dieses Stands. Das alte Rollenmodell ist ein Architekturentwurf, nicht der produktive Zugriffspfad.
