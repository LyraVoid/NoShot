import { useCallback, useEffect, useState } from "react";
import { useSnackbar } from "../Snackbar";
import { ActionMenu } from "../m3e/components/atoms/ActionMenu";
import { Icon } from "../m3e/components/atoms/Icon";
import { FlexiblePageHeader } from "../m3e/components/molecules/FlexiblePageHeader";
import { copyText, diagnose, fetchLogs } from "../lib/bridge";
import { useI18n } from "../i18n/I18n";
import styles from "./Logs.module.css";

export function Logs() {
  const snack = useSnackbar();
  const { t } = useI18n();
  const [text, setText] = useState<string | null>("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setText(await fetchLogs());
    } catch {
      setText(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async () => {
    if (!text) return;
    const ok = await copyText(text);
    snack(ok ? t("logs.copied") : t("logs.copyFailed"), ok ? "default" : "error");
  };

  const copyDiagnostics = async () => {
    try {
      const report = await diagnose();
      if (report.trim() && await copyText(report)) {
        snack(t("logs.diagCopied"));
        return;
      }
    } catch {}
    snack(t("logs.diagFailed"), "error");
  };

  return (
    <>
      <FlexiblePageHeader
        title={t("logs.title")}
        aside={(
          <ActionMenu
            label={t("logs.menu")}
            items={[
              { label: t("logs.refresh"), onSelect: () => void load(), disabled: loading },
              { label: t("logs.copy"), onSelect: () => void copy(), disabled: !text },
              { label: t("logs.diag"), onSelect: () => void copyDiagnostics() },
            ]}
          >
            <button type="button" className={styles.overflow} aria-label={t("logs.menu")}>
              <Icon name="more" />
            </button>
          </ActionMenu>
        )}
      />
      <div className={styles.page}>
        {text ? (
          <pre className={styles.panel} aria-label={t("logs.panel")}>{text}</pre>
        ) : (
          <div className={styles.empty} role="status">
            <span className={styles.emptyIcon}>
              <Icon name={text === null ? "notice" : "terminal"} />
            </span>
            <p className={styles.emptyTitle}>
              {loading ? t("logs.reading") : text === null ? t("logs.unreadable") : t("logs.empty")}
            </p>
            <p className={styles.emptyBody}>
              {text === null ? t("logs.unreadableBody") : t("logs.emptyBody")}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
