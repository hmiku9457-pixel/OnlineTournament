/** Position of the last eligible participant when not everyone can advance. */
export function getSwissCutoffRowIndex(
  standings: readonly { name: string }[],
  qualifyingPlaces: number,
  withdrawn: ReadonlySet<string> = new Set(),
): number | null {
  if (!Number.isInteger(qualifyingPlaces) || qualifyingPlaces < 1) return null;
  const eligibleIndices = standings.flatMap((row, index) => withdrawn.has(row.name) ? [] : [index]);
  if (eligibleIndices.length <= qualifyingPlaces) return null;
  return eligibleIndices[qualifyingPlaces - 1];
}

export function SwissQualificationCutoffRow({ qualifyingPlaces, finalized, colSpan = 10 }: { qualifyingPlaces: number; finalized: boolean; colSpan?: number }) {
  const label = `Cut-off · ${qualifyingPlaces} Qualifikationsplätze${finalized ? '' : ' · vorläufig'}`;
  return (
    <tr className="swiss-qualification-cutoff" aria-label={label}>
      <td colSpan={colSpan}>
        <div className="swiss-qualification-cutoff-line">
          <span>{label}</span>
        </div>
      </td>
    </tr>
  );
}
