import { useCallback, useEffect, useState } from "react";
import { useSnackbar } from "../Snackbar";
import { ActionMenu } from "../m3e/components/atoms/ActionMenu";
import { Icon } from "../m3e/components/atoms/Icon";
import { FlexiblePageHeader } from "../m3e/components/molecules/FlexiblePageHeader";
import { copyText, diagnose, fetchLogs } from "../lib/bridge";
import styles from "./Logs.module.css";

export function Logs() {
  const snack = useSnackbar();
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
    snack(ok ? "日志已复制" : "复制失败", ok ? "default" : "error");
  };

  const copyDiagnostics = async () => {
    try {
      const report = await diagnose();
      if (report.trim() && await copyText(report)) {
        snack("诊断信息已复制");
        return;
      }
    } catch {}
    snack("无法复制诊断信息", "error");
  };

  return (
    <>
      <FlexiblePageHeader
        title="日志"
        aside={(
          <ActionMenu
            label="日志操作"
            items={[
              { label: "刷新日志", onSelect: () => void load(), disabled: loading },
              { label: "复制日志", onSelect: () => void copy(), disabled: !text },
              { label: "复制诊断信息", onSelect: () => void copyDiagnostics() },
            ]}
          >
            <button type="button" className={styles.overflow} aria-label="日志操作">
              <Icon name="more" />
            </button>
          </ActionMenu>
        )}
      />
      <div className={styles.page}>
        {text ? (
          <pre className={styles.panel} aria-label="运行日志">{text}</pre>
        ) : (
          <div className={styles.empty} role="status">
            <span className={styles.emptyIcon}>
              <Icon name={text === null ? "notice" : "terminal"} />
            </span>
            <p className={styles.emptyTitle}>
              {loading ? "正在读取日志" : text === null ? "无法读取日志" : "还没有模块日志"}
            </p>
            <p className={styles.emptyBody}>
              {text === null
                ? "请确认管理器的 WebUI 可以执行 logcat。"
                : "启动一次目标应用，再点右上角刷新。"}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
