import { useEffect, useRef, useState } from 'react';
import type { ControlHelpTopic } from '@/domain/controlGuide';
import { getVenueTerminology } from '@/domain/venueTerminology';
import { sportScoring } from '@/domain/sportScoring';

type HelpStep = { title: string; description: string };

function getTopics(sport: string): Array<{ id: ControlHelpTopic; label: string; intro: string; steps: HelpStep[] }> {
  const venue = getVenueTerminology(sport);
  const rules = sportScoring(sport);
  const scoreSport = rules.mode === 'score';
  return [
  {
    id: 'start', label: 'Schnellstart', intro: 'Der Ablauf von der Vorbereitung bis zur letzten Partie.',
    steps: [
      { title: 'Teilnehmer prüfen', description: 'Unter „Teilnehmer“ Namen und Spielercodes kontrollieren. Vor dem ersten Start sind Nachmeldungen möglich.' },
      { title: 'Auslosung vorbereiten', description: 'Im „Turnierverlauf“ die erste Phase auswählen und gegebenenfalls Gruppen oder Startplätze verändern.' },
      { title: 'Turnier starten', description: 'Oben „Turnier starten“ wählen. Die Auslosung dieser Phase wird dabei festgeschrieben.' },
      { title: 'Spiele abwickeln', description: `Unter „Übersicht“ wartende Partien ${venue.dativePlural} zuweisen, ${scoreSport ? 'Spielstände' : 'Sätze'} erfassen und Endergebnisse abschließen. Die nächste Phase startet später ausdrücklich durch die Turnierleitung.` },
    ],
  },
  {
    id: 'tables', label: venue.plural, intro: 'Karten- und Planansicht steuern dieselben Partien.',
    steps: [
      { title: `${venue.singular} öffnen`, description: `In der Planansicht auf die gewünschte Spielfläche klicken: Die Bedienung öffnet sich im Fenster. In der Kartenansicht stehen die Bedienelemente direkt auf der Karte.` },
      { title: 'Spiel zuweisen', description: 'Ein wartendes Spiel auswählen oder aus „Nächste Spiele“ auf eine freie Spielfläche ziehen. Mit der Zuweisung beginnt die Partie.' },
      { title: `${venue.singular} wechseln oder freigeben`, description: 'Bei laufenden Spielen lassen sich Spielort und Zuweisung ändern. Bereits erfasste Ergebnisse bleiben dabei erhalten.' },
      { title: `${venue.singular} sperren`, description: `Gesperrte ${venue.plural} erhalten keine neuen Spiele. Eine bereits laufende Partie wird dadurch nicht abgebrochen.` },
    ],
  },
  {
    id: 'queue', label: 'Nächste Spiele', intro: 'Hier stehen die wartenden Begegnungen und ihre Pausenzeiten.',
    steps: [
      { title: 'Warteliste eingrenzen', description: 'Mit „Zuweisbar“ siehst du Partien, die jetzt zugewiesen werden können; „Aktuell blockiert“ zeigt die übrigen. Gruppe, Spieltag und die Namenssuche lassen sich kombinieren. Die Rangnummern bleiben unverändert.' },
      { title: 'Automatisch zuweisen', description: 'Der große Button verteilt mehrere mögliche Partien auf freie Spielflächen; der Button je Partie weist nur dieses eine Spiel zu.' },
      { title: 'Manuell zuweisen', description: '„Zuweisen“ öffnet die Auswahl freier Spielflächen. Alternativ eine Partie auf eine freie Karte oder auf die Spielfläche im Plan ziehen.' },
      { title: 'Pausenzeiten lesen', description: 'Die Zeit neben einem Namen zeigt die Pause seit der letzten tatsächlich gespielten Partie. Sie ist eine Planungshilfe, keine feste Sperrfrist.' },
      { title: 'Konflikte vermeiden', description: 'Ist ein Teilnehmer bereits einer Spielfläche zugewiesen, zeigt die Warteliste den Spielort orange an und sperrt die Zuweisung dieser Partie. Auch belegte oder gesperrte Spielflächen sowie eine Turnierpause verhindern neue Zuweisungen.' },
    ],
  },
  {
    id: 'results', label: 'Ergebnisse', intro: scoreSport ? `${rules.plural} der beiden Seiten erfassen und die Partie abschließen.` : 'Sätze aus Sicht des links angezeigten Spielers eintragen.',
    steps: scoreSport ? [
      { title: 'Spielstand erfassen', description: `Die ${rules.plural.toLowerCase()} beider Seiten als ganze Zahlen eingeben. „Zwischenstand speichern“ aktualisiert die Live-Anzeige, ohne die Partie zu beenden.` },
      { title: 'Unentschieden und Entscheidung', description: rules.allowsDraw ? 'Bei einem Remis in Entscheidungsspielen stehen Verlängerung, Elfmeterschießen und Losentscheid zur Wahl. In der Verlängerung lassen sich auch unentschiedene Live-Stände speichern; beim Abschluss muss ein Sieger feststehen.' : 'Bei Basketball bitte den Spielstand nach Verlängerung eingeben; ein Unentschieden ist nicht zulässig.' },
      { title: 'Spiel abschließen', description: 'Mit „Spiel abschließen“ den Endstand speichern. Die Spielfläche wird wieder frei und die Tabelle wird aktualisiert.' },
      { title: 'Korrekturen', description: 'In Schweizer und K.-o.-Runden bleiben Ergebnisse bearbeitbar, bis erstmals ein Spiel einer späteren Runde einem Tisch zugewiesen wurde. Nach Start der nächsten Phase sind Korrekturen der vorigen Phase ebenfalls gesperrt.' },
    ] : [
      { title: 'Sätze eingeben', description: rules.shortSetEntry ? 'Kurzform: 7 bedeutet 11:7, −7 bedeutet 7:11 und 10 bedeutet 12:10. Auch 11:9 ist möglich.' : 'Jeden Satz als Punkte links:rechts eingeben. Die Gewinnpunkte und ein möglicher Entscheidungssatz richten sich nach der Sportart.' },
      { title: 'Jeden Satz bestätigen', description: 'Mit Enter oder „Satz bestätigen“ speichern. Gespeicherte Sätze lassen sich durch Anklicken des Satzstands korrigieren.' },
      { title: 'Endergebnis abschließen', description: 'Bei längeren Best-of-Partien und im Schweizer System bzw. K.-o.-Modus das vorläufige Endergebnis ausdrücklich bestätigen. Erst dann wird die Spielfläche wieder frei.' },
      { title: 'Danach ist das Spiel abgeschlossen', description: 'Nach dem endgültigen Speichern wird die Spielfläche frei. In Schweizer und K.-o.-Runden sind Korrekturen noch bis zur ersten Tischzuweisung in einer späteren Runde erlaubt; der Start der nächsten Phase sperrt die vorherige Phase.' },
    ],
  },
  {
    id: 'phases', label: 'Turnierverlauf', intro: 'Jede Phase hat ihre eigene Auslosung, Ergebnisse und Freigabe.',
    steps: [
      { title: 'Phase auswählen', description: 'Die Phasenleiste zeigt „Bearbeitbar“, „Läuft“, „Beendet“ oder „Gesperrt“. Durch Anklicken die jeweilige Phase öffnen.' },
      { title: 'Vor dem Start bearbeiten', description: 'Solange „Bearbeitbar“ angezeigt wird, lassen sich Gruppen oder K.-o.-Startplätze verändern. Änderungen werden unmittelbar gespeichert.' },
      { title: 'Automatischer Abschluss', description: 'Nach dem letzten regulären Spiel wird die Phase abgeschlossen und die Qualifizierten werden für die nächste Phase übernommen – sofern kein Stichentscheid nötig ist.' },
      { title: 'Schweizer Begegnungen', description: 'Bei Sportarten mit Unentschieden werden die Paarungsgruppen nach 3 Punkten je Sieg, 1 je Unentschieden und 0 je Niederlage gebildet. Die SB-Wertung ist eine separate Feinwertung.' },
      { title: 'Schweizer Gleichstand am Cut-off', description: 'Sind alle sportlichen Tie-Breaker an der Qualifikationsgrenze identisch, bleibt die Phase offen. Die Turnierleitung dokumentiert dann einen zusätzlich gespielten Entscheidungssatz oder wählt nach einem physischen Losentscheid die qualifizierte Person aus.' },
      { title: 'Nächste Phase bewusst starten', description: 'Erst die neue Auslosung prüfen, dann „Nächste Phase starten“ wählen. Danach ist ihre Setzung gesperrt.' },
    ],
  },
  {
    id: 'participants', label: 'Teilnehmer', intro: 'Teilnehmerdaten, Spielübersichten und Rückzüge verwalten.',
    steps: [
      { title: 'Daten und Codes', description: 'Mit „Daten bearbeiten“ Namen und Spielercode ändern; mit „Spielübersicht“ alle Begegnungen einer Person anzeigen.' },
      { title: 'Nachmeldungen', description: 'Neue Teilnehmer können vor dem ersten Turnierstart hinzugefügt werden und fließen in die Auslosung ein.' },
      { title: 'Rückzug', description: '„Zurückziehen“ entfernt eine Person aus weiteren Partien. Während einer laufenden Phase ist das nicht rückgängig zu machen; betroffene Spiele werden kampflos gewertet.' },
      { title: 'Wiederherstellung', description: 'Vor Beginn einer Folgephase kann ein zulässiger Rückzug gegebenenfalls rückgängig gemacht werden. Bei gesperrter Aktion erklärt der Hinweis den Grund.' },
    ],
  },
  {
    id: 'matches', label: 'Spiele', intro: 'Die vollständige Liste hilft bei der Kontrolle und Korrektur.',
    steps: [
      { title: 'Status erkennen', description: '„Wartet“: noch nicht zugewiesen. „Läuft“: am Spielort. „Abgeschlossen“: Ergebnis gespeichert.' },
      { title: 'Details ansehen', description: `„Ergebnis anzeigen“ öffnet ${scoreSport ? 'den Spielstand' : 'die Satzergebnisse'}. Abgeschlossene, noch bearbeitbare Partien können dort korrigiert werden.` },
      { title: 'Gezielt finden', description: 'Mit Status, Phase, Spielort und der Namenssuche lassen sich Partien auch bei größeren Turnieren schnell finden.' },
    ],
  },
  {
    id: 'audit', label: 'Protokoll', intro: 'Wichtige Verwaltungsaktionen werden chronologisch aufgelistet.',
    steps: [
      { title: 'Änderungen nachverfolgen', description: 'Spielortzuweisungen, Ergebnisänderungen, Bestätigungen und Turnierpausen sind mit Zeitpunkt und Vorher/Nachher-Werten sichtbar.' },
      { title: 'Korrektur zurücknehmen', description: 'Die jüngste Ergebniskorrektur lässt sich rückgängig machen, solange keine spätere Runde erstmals einem Tisch zugewiesen wurde und keine Folgephase gestartet ist.' },
      { title: 'Lokaler Testbetrieb', description: 'Die Einträge stammen aktuell aus dem Browser und sind keine manipulationssichere, verifizierte Benutzerhistorie.' },
    ],
  },
  ];
}

export function ControlHelpButton({ topic, onOpen, label }: { topic: ControlHelpTopic; onOpen: (topic: ControlHelpTopic) => void; label?: string }) {
  return <button type="button" className="control-help-button" aria-label="Hilfe zu diesem Bereich" onClick={() => onOpen(topic)}>{label ?? <>Hilfe <span className="control-help-mark" aria-hidden="true">?</span></>}</button>;
}

export function TournamentControlHelp({ initialTopic, onClose, sport }: { initialTopic: ControlHelpTopic; onClose: () => void; sport: string }) {
  const [selectedTopic, setSelectedTopic] = useState<ControlHelpTopic>(initialTopic);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const topics = getTopics(sport);
  const topic = topics.find((item) => item.id === selectedTopic) ?? topics[0];

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const controls = Array.from(dialogRef.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      if (!controls.length) return;
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls[controls.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) { event.preventDefault(); controls[0].focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus?.focus(); };
  }, [onClose]);

  return (
    <div className="prototype-modal-backdrop control-help-backdrop" role="presentation" onMouseDown={onClose}>
      <section ref={dialogRef} className="prototype-modal control-help-dialog" role="dialog" aria-modal="true" aria-labelledby="control-help-title" aria-describedby="control-help-description" onMouseDown={(event) => event.stopPropagation()}>
        <div className="control-help-heading">
          <div><span className="badge ready">HILFE FÜR DIE TURNIERLEITUNG</span><h2 id="control-help-title">So funktioniert die Turnierleitung</h2><p className="muted" id="control-help-description">Bereich auswählen und die kurze Anleitung direkt nachlesen.</p></div>
          <button ref={closeRef} className="btn small" type="button" onClick={onClose}>Schließen</button>
        </div>
        <nav className="control-help-topics" aria-label="Hilfethemen">
          {topics.map((item) => <button key={item.id} type="button" aria-current={selectedTopic === item.id ? 'true' : undefined} className={selectedTopic === item.id ? 'active' : ''} onClick={() => setSelectedTopic(item.id)}>{item.label}</button>)}
        </nav>
        <div className="control-help-body" key={topic.id}>
          <h3>{topic.label}</h3>
          <p className="muted">{topic.intro}</p>
          <ol className="control-help-steps">{topic.steps.map((step) => <li key={step.title}><strong>{step.title}</strong><span>{step.description}</span></li>)}</ol>
          {selectedTopic === 'start' && <p className="control-help-notice"><strong>Wichtig für einen echten Einsatz:</strong> Die aktuelle Version speichert Turniere noch lokal im Browser. Gemeinsame Bearbeitung über mehrere Geräte und sichere Zugangscodes benötigen die vorgesehene Serveranbindung.</p>}
        </div>
      </section>
    </div>
  );
}
