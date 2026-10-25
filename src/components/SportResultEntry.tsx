import { ScoreMatchEntry } from '@/components/ScoreMatchEntry';
import { SetBySetEntry } from '@/components/SetBySetEntry';
import { sportScoring } from '@/domain/sportScoring';
import type { MatchSet } from '@/domain/types';
import type { MockRuntimeMatch } from '@/services/mockRuntime';

export interface SportResultEntryProps {
  match: MockRuntimeMatch;
  onSaved?: () => void;
  onCompleted?: (sets: MatchSet[]) => void;
  compact?: boolean;
  sideARecord?: string;
  sideBRecord?: string;
  allowEditFinished?: boolean;
  swissAdminEntry?: boolean;
  directorEntry?: boolean;
}

export function SportResultEntry(props: SportResultEntryProps) {
  return sportScoring(props.match.sport).mode === 'score'
    ? <ScoreMatchEntry {...props} />
    : <SetBySetEntry {...props} />;
}
