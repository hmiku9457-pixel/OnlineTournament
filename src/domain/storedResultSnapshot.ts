import type { MatchSet } from '@/domain/types';

/** Stable snapshot across periodic runtime refreshes which rebuild the sets array.
 * A changed result is a new snapshot; a new array with identical data is not. */
export function storedResultSnapshot(sets: readonly MatchSet[] | undefined): string {
  return JSON.stringify(sets ?? []);
}
