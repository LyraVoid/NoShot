import styles from "./ExpressiveSwitch.module.css";
import { Icon } from "./Icon";

export function ExpressiveSwitch({
  label,
  checked,
  disabled,
  onChange,
  inert = false,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
  /** Renders the switch as a visual only; the surrounding row owns the action. */
  inert?: boolean;
}) {
  const track = (
    <span className={styles.track} aria-hidden="true">
      <span className={styles.thumb}>
        <Icon name={checked ? "check" : "close"} />
      </span>
    </span>
  );
  if (inert) {
    return (
      <span className={styles.root} data-disabled={disabled || undefined} data-inert="true" aria-hidden="true">
        <input type="checkbox" checked={checked} readOnly tabIndex={-1} aria-hidden="true" />
        {track}
      </span>
    );
  }
  return (
    <label className={styles.root} data-disabled={disabled || undefined}>
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.currentTarget.checked)}
      />
      {track}
    </label>
  );
}
