/** Pixel dimensions for fitting the entire enlarged cross table on screen.
 * All 1..32 players share the available width and height, without scrollbars.
 * Very small viewports inevitably result in small lettering; cell titles
 * preserve the full names and scores.
 */
export interface RoundRobinMatrixFit {
  nameWidth: number;
  cellWidth: number;
  rowHeight: number;
  cellFont: number;
  nameFont: number;
}

export function roundRobinMatrixFit(players: number, width: number, height: number): RoundRobinMatrixFit {
  const count = Math.max(1, Math.min(32, Math.trunc(players) || 1));
  const availableWidth = Math.max(1, width - 2);
  const availableHeight = Math.max(1, height - 2);
  const nameWidth = Math.min(190, Math.max(38, availableWidth * (count >= 20 ? 0.17 : 0.23)));
  const cellWidth = Math.max(0.1, (availableWidth - nameWidth) / count);
  const rowHeight = availableHeight / (count + 1);
  // Allow at least five numerals (e.g. 11:11) in every score cell.
  const cellFont = Math.min(14, rowHeight * 0.56, cellWidth / 3.4);
  const nameFont = Math.min(13, rowHeight * 0.58, nameWidth / 13);
  return { nameWidth, cellWidth, rowHeight, cellFont, nameFont };
}
