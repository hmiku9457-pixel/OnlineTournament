import { useEffect, useRef, useState } from 'react';

interface DrawActionButtonProps {
  label: string;
  title?: string;
  onAction: () => boolean;
  onChanged: () => void;
}

const CONFIRMATION_DURATION_MS = 1500;

/** Provides short, in-place confirmation for successfully saved draw changes. */
export function DrawActionButton({ label, title, onAction, onChanged }: DrawActionButtonProps) {
  const [saved, setSaved] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
  }, []);

  function handleClick() {
    if (saved || !onAction()) return;
    setSaved(true);
    onChanged();
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setSaved(false);
      timeoutRef.current = null;
    }, CONFIRMATION_DURATION_MS);
  }

  return (
    <button
      className={saved ? 'btn small draw-action-feedback is-saved' : 'btn small draw-action-feedback'}
      type="button"
      onClick={handleClick}
      title={saved ? 'Auslosung gespeichert' : title}
      disabled={saved}
    >
      <span className={saved ? 'draw-action-original is-hidden' : 'draw-action-original'}>{label}</span>
      {saved && <span className="draw-action-confirmation" role="status">Gespeichert ✓</span>}
    </button>
  );
}
