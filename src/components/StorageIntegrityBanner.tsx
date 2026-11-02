import { useEffect, useState } from 'react';
import { discardCorruptLocalRecord, getTournamentStorageError, listCorruptLocalRecords } from '@/services/localTournamentStorage';
import { discardIsolatedCreationDraftAtomic, listIsolatedCreationDraftsAtomic, type IsolatedCreationDraft } from '@/domain/savedCreationDraftStore';

export function StorageIntegrityBanner() {
  const [, refresh] = useState(0);
  const [invalidDrafts, setInvalidDrafts] = useState<IsolatedCreationDraft[]>([]);
  useEffect(() => {
    let active = true;
    const updateDrafts = () => { void listIsolatedCreationDraftsAtomic().then((drafts) => {
      if (active) setInvalidDrafts(drafts);
    }).catch(() => { /* Main storage warning is handled separately. */ }); };
    updateDrafts();
    window.addEventListener('draft-integrity-change', updateDrafts);
    return () => { active = false; window.removeEventListener('draft-integrity-change', updateDrafts); };
  }, []);
  useEffect(() => {
    const update = () => refresh((n) => n + 1);
    window.addEventListener('tournament-storage-integrity-change', update);
    return () => window.removeEventListener('tournament-storage-integrity-change', update);
  }, []);
  const damaged = listCorruptLocalRecords();
  const error = getTournamentStorageError();
  if (!error && damaged.length === 0 && invalidDrafts.length === 0) return null;
  return (
    <section className="card" role="alert" aria-label="Turnierspeicher überprüfen" style={{ margin: '12px auto', maxWidth: 960 }}>
      <h2>Turnierspeicher überprüfen</h2>
      {error && <p>{error}</p>}
      {invalidDrafts.length > 0 && <>
        <p>Beschädigte aktuelle Turnierentwürfe wurden isoliert. Andere Entwürfe bleiben nutzbar.</p>
        <ul>{invalidDrafts.map((item) => <li key={item.id}>
          <strong>Entwurf {item.id}</strong> – {item.reason}{' '}
          <button type="button" className="btn small danger" onClick={() => {
            if (!window.confirm('Isolierten Entwurf dauerhaft verwerfen?')) return;
            void discardIsolatedCreationDraftAtomic(item.id).catch(() =>
              window.alert('Der isolierte Entwurf konnte nicht zurückgesetzt werden.'));
          }}>Entwurf zurücksetzen</button>
        </li>)}</ul>
      </>}
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
