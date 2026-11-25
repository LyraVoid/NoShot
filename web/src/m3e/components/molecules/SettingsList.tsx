import type { ComponentProps, ReactNode } from "react";
import { Icon, type IconName } from "../atoms/Icon";
import styles from "./SettingsList.module.css";

export function SettingsList({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section
      className={styles.group}
      aria-label={label}
      data-testid="segmented-list"
    >
      {children}
    </section>
  );
}

export function SettingsRow({
  icon,
  leading,
  title,
  id,
  detail,
  trailing,
  endAction,
  action,
  disabled,
  dataAvailability,
  role,
  checked,
  className,
  ...trigger
}: {
  icon?: IconName;
  /** Replaces the IconName slot with arbitrary content (e.g. an avatar). */
  leading?: ReactNode;
  /** Renders the row as a checkbox with selected styling hooks. */
  checked?: boolean;
  title: string;
  id?: string;
  detail?: string;
  trailing?: ReactNode;
  endAction?: ReactNode;
  action?: () => void;
  disabled?: boolean;
  dataAvailability?: "available" | "unavailable" | "unknown" | "loading";
  role?: "alert" | "status" | "switch";
} & Pick<
  ComponentProps<"button">,
  | "ref"
  | "onClick"
  | "className"
  | "aria-haspopup"
  | "aria-expanded"
  | "aria-controls"
  | "aria-description"
  | "aria-checked"
>) {
  const content = (
    <>
      {leading ? (
        <span className={styles.leading}>{leading}</span>
      ) : (
        icon && (
          <span className={styles.icon}>
            <Icon name={icon} />
          </span>
        )
      )}
      <span className={styles.copy}>
        <span id={id}>{title}</span>
        {detail && (
          <span className={styles.detail} data-testid="settings-row-detail">
            {detail}
          </span>
        )}
      </span>
      {trailing}
    </>
  );
  if (action || disabled || trigger.onClick) {
    const button = (
      <button
        className={`${styles.row} ${styles.action} ${icon || leading ? "" : styles.noIcon} ${className ?? ""}`}
        type="button"
        onClick={action}
        {...trigger}
        disabled={disabled}
        aria-label={title}
        aria-checked={checked ?? trigger["aria-checked"]}
        data-availability={dataAvailability}
        data-selected={checked || undefined}
        role={checked === undefined ? role : "checkbox"}
        data-testid="settings-row"
      >
        {content}
      </button>
    );
    return endAction ? (
      <div className={styles.split}>
        {button}
        {endAction}
      </div>
    ) : (
      button
    );
  }
  return (
    <div
      className={`${styles.row} ${icon || leading ? "" : styles.noIcon}`}
      data-availability={dataAvailability}
      data-selected={checked || undefined}
      role={checked === undefined ? role : "checkbox"}
      aria-checked={checked ?? trigger["aria-checked"]}
      data-testid="settings-row"
    >
      {content}
    </div>
  );
}
