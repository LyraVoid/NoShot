import { useState, useEffect } from "react";
import { isDemo, moduleVersion, zygiskStatus } from "../lib/bridge";
import { CONF_PATHS } from "../lib/conf";
import type { ZygiskStatus } from "../lib/types";
import { Icon, type IconName } from "../m3e/components/atoms/Icon";
import { FlexiblePageHeader } from "../m3e/components/molecules/FlexiblePageHeader";
import { SegmentedSection } from "../m3e/components/molecules/SegmentedSection";
import { SettingsRow } from "../m3e/components/molecules/SettingsList";
import { useI18n } from "../i18n/I18n";
import type { Message, Translate } from "../i18n/messages";
import styles from "./Home.module.css";

// Two headlines only: activated or not. The visual tone follows the underlying
// state (active / failed / missing / unknownProtocol) so failures read as errors.
type CardState = "active" | "failed" | "missing" | "unknownProtocol" | "loading";

function cardState(status: ZygiskStatus | undefined, t: Translate): {
  title: string;
  detail: string;
  icon: IconName;
  state: CardState;
} {
  if (!status) return { title: t("home.checking"), detail: t("home.checkingDetail"), icon: "loading", state: "loading" };
  if (status.module === "loaded") {
    return { title: t("home.active"), detail: t("home.activeDetail"), icon: "active", state: "active" };
  }
  if (status.module === "missing") {
    return { title: t("home.inactive"), detail: t("home.missingLib"), icon: "missing", state: "missing" };
  }
  if (status.module === "installed" || status.module === "disabled") {
    return {
      title: t("home.inactive"),
      detail: status.module === "installed" ? t("home.installedNotLoaded") : t("home.disabledModule"),
      icon: "failed",
      state: "failed",
    };
  }
  return {
    title: t("home.inactive"),
    detail: status.host === "present" ? t("home.hostPresent") : t("home.noLoad"),
    icon: "unknownProtocol",
    state: "unknownProtocol",
  };
}

const MODULE = {
  loaded: "home.mod.loaded",
  installed: "home.mod.installed",
  disabled: "home.mod.disabled",
  missing: "home.mod.missing",
  unknown: "home.mod.unknown",
} as const satisfies Record<ZygiskStatus["module"], Message>;

export function Home() {
  const { t } = useI18n();
  const [status, setStatus] = useState<ZygiskStatus>();
  const [version, setVersion] = useState("—");
  const [probe, setProbe] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let current = true;
    void zygiskStatus().then((next) => {
      if (current) {
        setStatus(next);
        setLoading(false);
      }
    });
    return () => { current = false; };
  }, [probe]);

  useEffect(() => {
    let current = true;
    void moduleVersion().then((next) => { if (current) setVersion(next); });
    return () => { current = false; };
  }, []);

  const card = cardState(status, t);

  return (
    <>
      <FlexiblePageHeader title="NoShot" aside={isDemo ? t("home.preview") : t("home.overview")} />
      <div className={styles.dashboard}>
        <div className={styles.overview}>
          <output className={styles.activation} data-state={card.state}>
            <span className={styles.mark}><Icon name={card.icon} filled={card.state === "active"} /></span>
            <span>
              <span className={styles.title}>{card.title}</span>
              <span className={styles.detail}>{isDemo ? t("home.demoNote") : card.detail}</span>
            </span>
          </output>
          <SegmentedSection title={t("home.status")}>
            <SettingsRow icon="status" title={t("home.module")} detail={status ? t(MODULE[status.module]) : t("home.detecting")} />
            <SettingsRow icon="refresh" title={loading ? t("home.detecting") : t("home.detect")} disabled={loading} action={() => {
              setLoading(true);
              setProbe((current) => current + 1);
            }} />
          </SegmentedSection>
        </div>
        <SegmentedSection title={t("home.info")}>
          <SettingsRow icon="tag" title={t("home.version")} detail={version} />
          <SettingsRow icon="file" title={t("home.configPath")} detail={CONF_PATHS[0]} />
        </SegmentedSection>
      </div>
    </>
  );
}
