# Notfallbetrieb und externe Sicherungen

## Während eines Turniers
Die Turnierleitung bleibt bei unbekanntem Datenbankstand oder verlorener Lease gesperrt. Ergebnisse auf Papier notieren; erst nach bestätigter Verbindung kontrolliert nachtragen. Bei unklarem Speichervorgang den Speicherbeleg prüfen, nicht blind erneut eingeben. Vor Beginn und in Pausen bestätigte JSON-Sicherungen außerhalb des Browsers speichern. Die Betriebsdiagnose kann ohne Teilnehmerdaten und Tokens weitergegeben werden.

## Optional: verschlüsselter täglicher Anwendungsdaten-Export
Der Workflow `encrypted-backup.yml` ist standardmäßig deaktiviert. Aktivierung erfordert explizit:
1. Lokal ein age-Schlüsselpaar erstellen (age-keygen). Privaten Schlüssel offline und separat sichern; niemals in GitHub hinterlegen.
2. In GitHub Actions Secrets `BACKUP_AGE_RECIPIENT` (öffentlicher age-Schlüssel) und `SUPABASE_BACKUP_DB_URL` (Session-Pooler oder direkte TLS-Verbindung mit geeigneter DB-Leserolle) einrichten. Kein Service-Role-Key, keine Zugangsdaten ins Repository.
3. Repository-Variable `ENABLE_ENCRYPTED_BACKUPS=true` setzen und Workflow manuell auslösen. Nur verschlüsselte Artefakte werden für 14 Tage gespeichert, nicht im Git-Verlauf.
4. Artefakt herunterladen, SHA256 prüfen und mit dem privaten Schlüssel in einer kontrollierten Umgebung entschlüsseln. Dump-Inhaltsverzeichnis mit pg_restore --list prüfen. Auf isolierter Testdatenbank Wiederherstellung testen. Niemals ungeprüft in die aktive Datenbank importieren.

Der Export umfasst Anwendungstabellen, inklusive privater Teilnehmerdaten und Zugangslinks. Auth-Nutzer, Auth-Konfiguration, Rollen, Funktionen und Infrastruktur werden nicht gesichert. Für eine vollständige Projektwiederherstellung sind passende Auth-Identitäten und aktive Migrationen sowie eine gesonderte Supabase-Projektsicherung erforderlich. Zugangslinks nach einer Wiederherstellung widerrufen/rotieren; alte Leases und Budgets vor Wiederaufnahme bereinigen. Wiederherstellung ist kein automatisches Zurückrollen laufender Turniere.

## Grenzen
Keine Backup-Secrets oder private Entschlüsselungsschlüssel werden von der Anwendung verwaltet. Solange die Variable nicht gesetzt und ein erfolgreicher Export samt Wiederherstellungsprobe nicht bestätigt ist, besteht kein bestätigtes externes Backup. GitHub-Aufbewahrung und Supabase-Tarifbedingungen beachten. Siehe https://supabase.com/docs/guides/platform/backups und https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore.
