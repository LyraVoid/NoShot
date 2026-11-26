import { useCallback, useEffect, useMemo, useState } from "react";
import { isDemo, loadApps, loadConf, saveConf } from "../lib/bridge";
import { useSnackbar } from "../Snackbar";
import { ChoiceMenu } from "../m3e/components/atoms/ChoiceMenu";
import { Icon } from "../m3e/components/atoms/Icon";
import { FlexiblePageHeader } from "../m3e/components/molecules/FlexiblePageHeader";
import { SettingsList, SettingsRow } from "../m3e/components/molecules/SettingsList";
import type { AppEntry, PatchMode } from "../lib/types";
import { useI18n } from "../i18n/I18n";
import styles from "./AppModes.module.css";

function initials(label: string): string {
  const chars = [...label.trim()];
  return (chars[0] ?? "?").toUpperCase();
}

function AppIcon({ app }: { app: AppEntry }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={styles.avatar} aria-hidden="true">
      {isDemo || app.missing || failed ? initials(app.label) : (
        <img src={`ksu://icon/${encodeURIComponent(app.pkg)}`} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      )}
    </span>
  );
}

export function AppModes() {
  const { t } = useI18n();
  const snack = useSnackbar();
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modes, setModes] = useState<Map<string, PatchMode>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    try {
      const [list, conf] = await Promise.all([loadApps(), loadConf()]);
      setApps(list);
      setSelected(new Set(conf.pkgs));
      setModes(new Map(conf.modes));
    } catch {
      snack(t("apps.loadFailed"), "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const chosen = useMemo(
    () => apps.filter((app) => selected.has(app.pkg)).sort((a, b) => a.label.localeCompare(b.label)),
    [apps, selected],
  );

  const setMode = async (pkg: string, mode: PatchMode) => {
    if (saving) return;
    const next = new Map(modes);
    if (mode === "system") next.delete(pkg);
    else next.set(pkg, mode);
    setModes(next);
    setSaving(true);
    try {
      if (!await saveConf(selected, next)) throw new Error();
    } catch {
      setModes(modes);
      snack(t("apps.saveFailRetry"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <FlexiblePageHeader
        title={t("apps.modesTitle")}
        back={{ label: t("nav.back"), onClick: () => { window.location.hash = "#/apps"; } }}
      />
      <div className={styles.page}>
        {loading ? (
          <SettingsList label={t("apps.loadingList")}>
            <SettingsRow icon="loading" role="status" title={t("apps.loadingList")} />
          </SettingsList>
        ) : chosen.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}><Icon name="apps" /></span>
            <p className={styles.emptyTitle}>{t("apps.modesEmpty")}</p>
            <a className={styles.emptyAction} href="#/apps">{t("apps.modesEmptyAction")}</a>
          </div>
        ) : (
          <SettingsList label={t("apps.modesTitle")}>
            {chosen.map((app) => {
              const mode = modes.get(app.pkg) ?? "system";
              return (
                <ChoiceMenu<PatchMode>
                  key={app.pkg}
                  label={t("apps.modeMenu", { app: app.label })}
                  value={mode}
                  options={[
                    { value: "system", label: t("apps.modeSystem") },
                    { value: "client", label: t("apps.modeClient") },
                  ]}
                  onChange={(value) => void setMode(app.pkg, value)}
                >
                  <SettingsRow
                    className={styles.modeRow}
                    leading={<AppIcon app={app} />}
                    title={app.label}
                    detail={app.pkg}
                    trailing={(
                      <span className={styles.mode}>
                        {t(mode === "client" ? "apps.modeShortClient" : "apps.modeShortSystem")}
                        <Icon name="chevron" />
                      </span>
                    )}
                  />
                </ChoiceMenu>
              );
            })}
          </SettingsList>
        )}
      </div>
    </>
  );
}
