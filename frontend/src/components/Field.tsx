import { useId, type ReactNode } from 'react';

interface Props {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: (id: string, describedBy: string | undefined) => ReactNode;
  style?: React.CSSProperties;
}

/** Label + control + hint/error, wired with ids for accessibility. */
export function Field({ label, hint, error, children, style }: Props) {
  const id = useId();
  const hintId = hint || error ? `${id}-hint` : undefined;
  return (
    <div className="field" style={style}>
      <label className="lbl" htmlFor={id}>
        {label}
      </label>
      {children(id, hintId)}
      {error ? (
        <span id={hintId} className="err small" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} className="hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
