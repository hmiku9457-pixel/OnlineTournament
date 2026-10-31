/** Spreadsheet-style letters for any number of tournament groups (A..Z, AA..). */
export function groupLetter(index: number): string {
  if (!Number.isInteger(index) || index < 0) return '?';
  let value = index + 1;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + value % 26) + label;
    value = Math.floor(value / 26);
  }
  return label;
}
