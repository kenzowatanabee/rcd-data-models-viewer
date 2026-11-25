import { Check, Copy } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

export type CopyState = 'idle' | 'copied' | 'failed';

/** Copies text and reports the outcome for ~1.5s. */
export function useCopy(): [CopyState, (text: string) => void] {
  const [state, setState] = useState<CopyState>('idle');
  useEffect(() => {
    if (state === 'idle') return;
    const timer = window.setTimeout(() => setState('idle'), 1500);
    return () => window.clearTimeout(timer);
  }, [state]);
  const copy = (text: string) => {
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (clipboard === undefined) {
      setState('failed');
      return;
    }
    clipboard.writeText(text).then(
      () => setState('copied'),
      () => setState('failed'),
    );
  };
  return [state, copy];
}

interface Props {
  text: string;
  /** What is copied, for the accessible name: "Copy path". */
  label: string;
  className?: string;
  children?: ReactNode;
}

/** An icon button that copies `text`, with visible and announced feedback. */
export function CopyButton({ text, label, className = '', children }: Props) {
  const [state, copy] = useCopy();
  const feedback =
    state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : '';
  return (
    <button
      type="button"
      className={`btn btn-ghost btn-sm copy-button ${className}`}
      onClick={() => copy(text)}
      title={label}
      aria-label={label}
      data-state={state}
    >
      {state === 'copied' ? (
        <Check size={13} aria-hidden="true" />
      ) : (
        <Copy size={13} aria-hidden="true" />
      )}
      {children}
      {feedback !== '' && <span className="copy-feedback">{feedback}</span>}
      <span className="visually-hidden" aria-live="polite">
        {feedback}
      </span>
    </button>
  );
}
