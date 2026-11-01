import { useEffect, useState } from 'react';
import { discardCorruptLocalRecord, getTournamentStorageError, listCorruptLocalRecords } from '@/services/localTournamentStorage';

export function StorageIntegrityBanner() {
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh((n) => n + 1);
    window.addEventListener('tournament-storage-integrity-change', update);
    return () => window.removeEventListener('tournament-storage-integrity-change', update);
  }, []);
  const damaged = listCorruptLocalRecords();
  const error = getTournamentStorageError();
  if (!error && damaged.length === 0) return null;
  return (
    <section className="card" role="alert" aria-label="Turnierspeicher überprüfen" style={{ margin: '12px auto', maxWidth: 960 }}>
      <h2>Turnierspeicher überprüfen</h2>
      {error && <p>{error}</p>}
      {damaged.length > 0 && <>
        <p>Beschädigte aktuelle Datensätze wurden aus der aktiven Turnierliste isoliert.
          Ihre ursprünglichen Inhalte bleiben bis zum gezielten Zurücksetzen separat erhalten.</p>
        <ul>{damaged.map((item) => (
          <li key={item.key}>
            <strong>{item.key.split(':').slice(-2).join(':')}</strong> – {item.reason}{' '}
            <button type="button" className="btn small danger" onClick={() => {
              if (!window.confirm('Diesen isolierten Datensatz endgültig verwerfen? Die ursprünglichen Daten können danach nicht wiederhergestellt werden.')) return;
              void discardCorruptLocalRecord(item.key).catch(() =>
                window.alert('Der isolierte Datensatz konnte nicht zurückgesetzt werden.'));
            }}>Datensatz zurücksetzen</button>
          </li>
        ))}</ul>
      </>}
    </section>
  );
}
