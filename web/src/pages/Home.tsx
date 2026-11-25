import { useState, useEffect } from "react";
import { isDemo, moduleVersion, zygiskStatus } from "../lib/bridge";
import { CONF_PATHS } from "../lib/conf";
import type { ZygiskStatus } from "../lib/types";
import { Icon, type IconName } from "../m3e/components/atoms/Icon";
import { FlexiblePageHeader } from "../m3e/components/molecules/FlexiblePageHeader";
import { SegmentedSection } from "../m3e/components/molecules/SegmentedSection";
import { SettingsRow } from "../m3e/components/molecules/SettingsList";
import styles from "./Home.module.css";

// Two headlines only: activated or not. The visual tone follows the underlying
// state (active / failed / missing / unknownProtocol) so failures read as errors.
type CardState = "active" | "failed" | "missing" | "unknownProtocol" | "loading";

function cardState(status?: ZygiskStatus): {
  title: string;
  detail: string;
  icon: IconName;
  state: CardState;
} {
  if (!status) return { title: "正在检测", detail: "正在读取模块状态", icon: "loading", state: "loading" };
  if (status.module === "loaded") {
    return { title: "已激活", detail: "已检测到模块加载", icon: "active", state: "active" };
  }
  if (status.module === "missing") {
    return { title: "未激活", detail: "未找到模块文件", icon: "missing", state: "missing" };
  }
  if (status.module === "installed" || status.module === "disabled") {
    return {
      title: "未激活",
      detail: status.module === "installed" ? "模块已安装，本次开机未加载" : "模块已禁用或待移除",
      icon: "failed",
      state: "failed",
    };
  }
  return {
    title: "未激活",
    detail: status.host === "present" ? "已检测到宿主，未确认激活" : "未检测到模块加载",
    icon: "unknownProtocol",
    state: "unknownProtocol",
  };
}

const MODULE = {
  loaded: "已观察到模块加载，尚不代表目标应用生效",
  installed: "已安装 · 未观察到模块加载",
  disabled: "模块已禁用或待移除",
  missing: "未找到模块库文件",
  unknown: "无法读取模块状态",
} as const;

export function Home() {
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

  const card = cardState(status);

  return (
    <>
      <FlexiblePageHeader title="NoShot" aside={isDemo ? "预览" : "运行概览"} />
      <div className={styles.dashboard}>
        <div className={styles.overview}>
          <output className={styles.activation} data-state={card.state}>
            <span className={styles.mark}><Icon name={card.icon} filled={card.state === "active"} /></span>
            <span>
              <span className={styles.title}>{card.title}</span>
              <span className={styles.detail}>{isDemo ? "仅展示界面，不读取设备" : card.detail}</span>
            </span>
          </output>
          <SegmentedSection title="运行状态">
            <SettingsRow icon="status" title="本模块" detail={status ? MODULE[status.module] : "正在检测…"} />
            <SettingsRow icon="refresh" title={loading ? "正在检测…" : "重新检测"} disabled={loading} action={() => {
              setLoading(true);
              setProbe((current) => current + 1);
            }} />
          </SegmentedSection>
        </div>
        <SegmentedSection title="信息">
          <SettingsRow icon="tag" title="模块版本" detail={version} />
          <SettingsRow icon="file" title="主配置路径" detail={CONF_PATHS[0]} />
        </SegmentedSection>
      </div>
    </>
  );
}
