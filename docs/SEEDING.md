# Setzverfahren in der lokalen Turnierleitung

Beide Funktionen stehen im Tab **Turnierverlauf** zur Verfügung, sobald die vorangegangene Phase abgeschlossen und die nächste noch nicht gestartet ist.

## Gruppenphase → Schweizer System

Der Button **Seeded Zuteilung** übernimmt die tatsächliche Gruppen-Endtabelle und erzeugt eine Startreihenfolge nach Schlangenprinzip. Bei vier Gruppen und jeweils vier Qualifikanten ergibt sich:

| Setzposition | Herkunft |
|---:|---|
| 1–4 | A1, B1, C1, D1 |
| 5–8 | D2, C2, B2, A2 |
| 9–12 | A3, B3, C3, D3 |
| 13–16 | D4, C4, B4, A4 |

Nur tatsächlich qualifizierte Teilnehmer werden gesetzt. Diese Reihenfolge ist der initiale Tie-Breaker der Schweizer Auslosung. Ab Runde 2 bestimmen die erspielten Sieg-/Niederlagenbilanzen die Scoregruppen.

## Gruppenphase/Schweizer System → K.-o.

Die Qualifikanten werden entsprechend der gespeicherten Abschlussrangfolge ihrer Vorphase gesetzt. Beim vollen 16er-Feld ergibt das in der ersten Runde u. a. **P1–P16** und **P2–P15**. P1 und P2 befinden sich in unterschiedlichen Turnierhälften und können daher frühestens im Finale aufeinandertreffen.

Bei 12 Spielern im 16er-Feld erhalten **P1–P4** jeweils ein Freilos. In diesem Fall tritt P1 nicht direkt gegen P12 an, sondern spielt erst in Runde 2 gegen den Gewinner des entsprechenden Erstrundenmatches. Freilose werden verteilt, sodass nicht direkt in Runde 2 zwei Freilosgewinner aufeinandertreffen, soweit dies mathematisch möglich ist.

Der Button verändert den noch nicht gestarteten Baum und entfernt bisherige Pins, da er eine *ausdrücklich neu gewählte vollständige Setzung* erzeugt. Danach können Startplätze wieder frei per Drag & Drop bearbeitet oder gepinnt werden. Der Button **Neue Zufallsverteilung** bleibt separat verfügbar.


## Erweiterung: Schweizer → Gruppen und Gruppen → K.-o.

- Nach einer abgeschlossenen Schweizer Phase kann die Gruppen-Auslosung per **„Tabellen nach Seeding erstellen“** aus der sichtbaren Schweizer Schlussrangliste neu gesetzt werden (A–B–C–D / D–C–B–A). Die Herkunftsplatzierung steht direkt neben dem Teilnehmernamen.
- **„Brackets nach Seeding zuteilen“** verwendet weiterhin die Qualifikationsreihenfolge und gewährt Freilose zuerst den besten Setzpositionen. Bei vorherigen Gruppen wird die erste K.-o.-Runde zusätzlich hinsichtlich früher Gruppenrematches optimiert. Ein Konflikt zwischen klassischer Paarung P1–Plast und Vermeidung eines Gruppenrematches wird zugunsten des späteren Wiedersehens aufgelöst.
- Die Setzung bleibt bis zum jeweiligen Phasenstart manuell bearbeitbar.
