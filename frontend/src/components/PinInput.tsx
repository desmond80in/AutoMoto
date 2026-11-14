/** Number of PIN digits accepted (the backend allows 4 to 6). */
const MAX = 6;
const MIN = 4;

/**
 * PIN entry with one visible slot per digit, so staff can see each key press register.
 * The real input sits on top of the slots, transparent but focusable: the numeric keypad, paste,
 * password managers and screen readers keep working.
 */
export function PinInput({
  id,
  value,
  onChange,
  autoComplete = 'off',
}: {
  id: string;
  value: string;
  onChange: (pin: string) => void;
  autoComplete?: string;
}) {
  return (
    <div className="pin-input">
      <div className="pin-slots" aria-hidden="true">
        {Array.from({ length: MAX }, (_, i) => (
          <span
            key={i}
            className={`pin-slot${i < value.length ? ' filled' : ''}${i === value.length ? ' next' : ''}${i >= MIN ? ' opt' : ''}`}
          />
        ))}
      </div>
      <input
        id={id}
        type="password"
        inputMode="numeric"
        maxLength={MAX}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, MAX))}
      />
    </div>
  );
}
