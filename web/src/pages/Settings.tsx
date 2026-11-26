import { useEffect, useState } from "react";
import { useSnackbar } from "../Snackbar";
import { ExpressiveSwitch } from "../m3e/components/atoms/ExpressiveSwitch";
import type { IconName } from "../m3e/components/atoms/Icon";
import { FlexiblePageHeader } from "../m3e/components/molecules/FlexiblePageHeader";
import { SegmentedSection } from "../m3e/components/molecules/SegmentedSection";
import { ChoiceMenu } from "../m3e/components/atoms/ChoiceMenu";
import { SettingsRow } from "../m3e/components/molecules/SettingsList";
import { loadSettings, openExternal, saveSettings } from "../lib/bridge";
import type { CaptureGuard, Settings as SettingsValue } from "../lib/types";
import type { Message } from "../i18n/messages";
import { Appearance, type AppearanceProps } from "./Appearance";
import { useI18n } from "../i18n/I18n";
import { localeName, locales } from "../i18n/messages";
import styles from "./Settings.module.css";

type BoolKey = {
  [K in keyof SettingsValue]: SettingsValue[K] extends boolean ? K : never;
}[keyof SettingsValue];

const captureLevels = ["off", "observe", "on"] as const;

const captureLabel = {
  off: "settings.captureOff",
  observe: "settings.captureObserve",
  on: "settings.captureOn",
} as const satisfies Record<CaptureGuard, Message>;

export function Settings(appearance: AppearanceProps) {
  const snack = useSnackbar();
  const { locale, setLocale, t } = useI18n();
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

  const patch = async <K extends keyof SettingsValue>(key: K, value: SettingsValue[K]) => {
    if (!settings || saving) return;
    const next = { ...settings, [key]: value };
    setSaving(true);
    try {
      if (!await saveSettings(next)) throw new Error();
      setSettings(next);
    } catch {
      snack(t("settings.saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  function toggle(key: BoolKey, icon: IconName, title: Message, detail: Message) {
    const on = settings?.[key] ?? false;
    const disabled = !settings || saving;
    return (
      <SettingsRow
        key={key}
        icon={icon}
        title={t(title)}
        detail={t(detail)}
        role="switch"
        aria-checked={on}
        disabled={disabled}
        action={() => void patch(key, !on)}
        trailing={<ExpressiveSwitch label={t(title)} checked={on} disabled={disabled} inert />}
      />
    );
  }

  function captureRow(value: CaptureGuard) {
    const disabled = !settings || saving;
    const level = t(captureLabel[value]);
    return (
      <ChoiceMenu
        key="captureGuard"
        label={t("settings.captureMenu", { level })}
        value={value}
        options={captureLevels.map((v) => ({ value: v, label: t(captureLabel[v]) }))}
        onChange={(next) => void patch("captureGuard", next)}
      >
        <SettingsRow
          icon="secure"
          title={t("settings.capture")}
          detail={t("settings.captureDetail")}
          disabled={disabled}
          trailing={<span>{level}</span>}
        />
      </ChoiceMenu>
    );
  }

  return (
    <>
      <FlexiblePageHeader title={t("settings.title")} aside={saving ? t("settings.saving") : undefined} />
      <div className={styles.page}>
        <div className={styles.preferences}>
          <SegmentedSection title={t("settings.behavior")}>
            {settings ? [
              toggle("systemHook", "active", "settings.system", "settings.systemDetail"),
              captureRow(settings.captureGuard),
              toggle("flagSecure", "secure", "settings.flag", "settings.flagDetail"),
              toggle("surfaceSecure", "layers", "settings.surface", "settings.surfaceDetail"),
              toggle("detectGuard", "filter", "settings.detect", "settings.detectDetail"),
            ] : (
              <SettingsRow icon={loadFailed ? "notice" : "loading"} role="status" title={loadFailed ? t("settings.readFailed") : t("settings.reading")} />
            )}
          </SegmentedSection>
          {settings && (
            <SegmentedSection title={t("settings.logSection")}>
              {toggle("log", "logs", "settings.logTitle", "settings.logDetail")}
            </SegmentedSection>
          )}
        </div>
        <Appearance {...appearance} />
        <SegmentedSection title={t("settings.about")}>
          <ChoiceMenu label={t("settings.language")} value={locale} options={locales.map((value) => ({ value, label: localeName[value] }))} onChange={setLocale}>
            <SettingsRow icon="language" title={t("settings.language")} trailing={<span>{localeName[locale]}</span>} />
          </ChoiceMenu>
          <SettingsRow icon="info" title={t("settings.dev")} detail="Matsuzaka Yuki · LyraVoid" />
          <SettingsRow
            icon="github"
            title="GitHub"
            detail="LyraVoid/NoShot"
            action={() => openExternal("https://github.com/LyraVoid/NoShot")}
          />
          <SettingsRow icon="file" title={t("settings.license")} detail="AGPL-3.0" />
        </SegmentedSection>
      </div>
    </>
  );
}
