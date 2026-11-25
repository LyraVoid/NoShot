import { useEffect, useState } from "react";
import { useSnackbar } from "../Snackbar";
import { ExpressiveSwitch } from "../m3e/components/atoms/ExpressiveSwitch";
import type { IconName } from "../m3e/components/atoms/Icon";
import { FlexiblePageHeader } from "../m3e/components/molecules/FlexiblePageHeader";
import { SegmentedSection } from "../m3e/components/molecules/SegmentedSection";
import { SettingsRow } from "../m3e/components/molecules/SettingsList";
import { loadSettings, openExternal, saveSettings } from "../lib/bridge";
import type { Settings as SettingsValue } from "../lib/types";
import { Appearance, type AppearanceProps } from "./Appearance";
import styles from "./Settings.module.css";

const behavior = [
  ["flagSecure", "secure", "窗口截屏限制", "处理目标应用窗口的截屏限制（FLAG_SECURE）。"],
  ["surfaceSecure", "layers", "图层截屏限制", "仅处理已有图层的安全标记变更，不影响创建时设为安全的图层。"],
  ["detectGuard", "filter", "截屏目录监听", "仅适用于文件监听，不影响 Android 系统截屏回调。"],
] as const satisfies readonly (readonly [keyof SettingsValue, IconName, string, string])[];

export function Settings(appearance: AppearanceProps) {
  const snack = useSnackbar();
  const [settings, setSettings] = useState<SettingsValue>();
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadSettings().then((loaded) => {
      if (alive) setSettings(loaded);
    }, () => {
      if (alive) setLoadFailed(true);
    });
    return () => { alive = false; };
  }, []);

  const patch = async (key: keyof SettingsValue, value: boolean) => {
    if (!settings || saving) return;
    const next = { ...settings, [key]: value };
    setSaving(true);
    try {
      if (!await saveSettings(next)) throw new Error();
      setSettings(next);
    } catch {
      snack("未能确认设置已保存，请重试", "error");
    } finally {
      setSaving(false);
    }
  };

  function toggle(key: keyof SettingsValue, icon: IconName, title: string, detail: string) {
    const on = settings?.[key] ?? false;
    const disabled = !settings || saving;
    return (
      <SettingsRow
        key={key}
        icon={icon}
        title={title}
        detail={detail}
        role="switch"
        aria-checked={on}
        disabled={disabled}
        action={() => void patch(key, !on)}
        trailing={<ExpressiveSwitch label={title} checked={on} disabled={disabled} inert />}
      />
    );
  }

  return (
    <>
      <FlexiblePageHeader title="设置" aside={saving ? "保存中…" : undefined} />
      <div className={styles.page}>
        <div className={styles.preferences}>
          <SegmentedSection title="模块行为">
            {settings ? behavior.map(([key, icon, title, detail]) => toggle(key, icon, title, detail)) : (
              <SettingsRow icon={loadFailed ? "notice" : "loading"} role="status" title={loadFailed ? "无法读取模块设置" : "正在读取模块设置…"} />
            )}
          </SegmentedSection>
          {settings && (
            <SegmentedSection title="日志记录">
              {toggle("log", "logs", "记录运行日志", "将模块运行信息写入系统日志，供排查问题使用。")}
            </SegmentedSection>
          )}
        </div>
        <Appearance {...appearance} />
        <SegmentedSection title="关于">
          <SettingsRow icon="info" title="开发者" detail="Matsuzaka Yuki · LyraVoid" />
          <SettingsRow
            icon="github"
            title="GitHub"
            detail="LyraVoid"
            action={() => openExternal("https://github.com/LyraVoid")}
          />
          <SettingsRow icon="file" title="许可证" detail="AGPL-3.0" />
        </SegmentedSection>
      </div>
    </>
  );
}
