import { useEffect, useState } from "react";
import { useSnackbar } from "../Snackbar";
import { ExpressiveSwitch } from "../m3e/components/atoms/ExpressiveSwitch";
import type { IconName } from "../m3e/components/atoms/Icon";
import { FlexiblePageHeader } from "../m3e/components/molecules/FlexiblePageHeader";
import { SegmentedSection } from "../m3e/components/molecules/SegmentedSection";
import { ChoiceMenu } from "../m3e/components/atoms/ChoiceMenu";
import { SettingsRow } from "../m3e/components/molecules/SettingsList";
import { loadSettings, openExternal, saveSettings } from "../lib/bridge";
import type { Settings as SettingsValue } from "../lib/types";
import type { Message } from "../i18n/messages";
import { Appearance, type AppearanceProps } from "./Appearance";
import { useI18n } from "../i18n/I18n";
import { localeName, locales } from "../i18n/messages";
import styles from "./Settings.module.css";

const behavior = [
  ["systemHook", "active", "settings.system", "settings.systemDetail"],
  ["flagSecure", "secure", "settings.flag", "settings.flagDetail"],
  ["surfaceSecure", "layers", "settings.surface", "settings.surfaceDetail"],
  ["detectGuard", "filter", "settings.detect", "settings.detectDetail"],
] as const satisfies readonly (readonly [keyof SettingsValue, IconName, Message, Message])[];

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

  const patch = async (key: keyof SettingsValue, value: boolean) => {
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

  function toggle(key: keyof SettingsValue, icon: IconName, title: Message, detail: Message) {
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

  return (
    <>
      <FlexiblePageHeader title={t("settings.title")} aside={saving ? t("settings.saving") : undefined} />
      <div className={styles.page}>
        <div className={styles.preferences}>
          <SegmentedSection title={t("settings.behavior")}>
            {settings ? behavior.map(([key, icon, title, detail]) => toggle(key, icon, title, detail)) : (
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
