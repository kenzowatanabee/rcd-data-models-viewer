import { CircleExclamationPoint, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  kind: 'loading' | 'error' | 'empty';
  title: string;
  /** The error message or the query, shown verbatim. */
  detail?: string;
  children?: ReactNode;
  actions?: ReactNode;
  centred?: boolean;
}

/** One look for loading, error and empty states across the app. */
export function StateView({
  kind,
  title,
  detail,
  children,
  actions,
  centred = false,
}: Props) {
  const icon =
    kind === 'loading' ? (
      <span className="spinner" aria-hidden="true" />
    ) : kind === 'error' ? (
      <CircleExclamationPoint size={20} aria-hidden="true" />
    ) : (
      <SearchX size={20} aria-hidden="true" />
    );
  return (
    <div
      className={`state state-${kind}${centred ? ' state-centred' : ''}`}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      <span className="state-icon">{icon}</span>
      <p className="state-title">{title}</p>
      {detail !== undefined && <p className="state-detail">{detail}</p>}
      {children}
      {actions !== undefined && <div className="state-actions">{actions}</div>}
    </div>
  );
}
