import { useComputedColorScheme, useMantineColorScheme } from "@mantine/core";
import { hexFromArgb } from "@material/material-color-utilities";
import { useId, useMemo } from "react";
import { ChoiceMenu } from "../m3e/components/atoms/ChoiceMenu";
import { SettingsRow } from "../m3e/components/molecules/SettingsList";
import { SegmentedSection } from "../m3e/components/molecules/SegmentedSection";
import { contrasts, defaultAppearance, defaultColorProfile, defaultColorScheme, schemes, seeds, specVersions, type ColorProfile, type Seed } from "../m3e/theme/colorProfile";
import { createColorScheme } from "../m3e/theme/theme";
import styles from "./Appearance.module.css";

export type AppearanceProps = {
  profile: ColorProfile;
  effectiveSpec: ColorProfile["specVersion"];
  setProfile: (value: ColorProfile) => void;
};

const seedOptions = Object.keys(seeds) as Seed[];
const labels = {
  auto: "跟随系统", dark: "深色", light: "浅色",
  slate: "蓝灰", blue: "海蓝", indigo: "靛紫", teal: "青绿", green: "苔绿", amber: "琥珀", rose: "玫瑰",
  "2021": "2021", "2025": "2025", expressive: "灵动（Expressive）", tonalSpot: "柔和（Tonal Spot）",
  vibrant: "鲜明（Vibrant）", neutral: "中性（Neutral）", monochrome: "单色（Monochrome）", content: "内容（Content）",
  fidelity: "保真（Fidelity）", fruitSalad: "水果拼盘（Fruit Salad）", rainbow: "彩虹（Rainbow）",
  standard: "标准", medium: "中等", high: "高",
};

function ChoiceRow<T extends keyof typeof labels>({ title, value, options, change, detail = labels[value] }: {
  title: string; value: T; options: readonly T[]; change: (value: T) => void; detail?: string;
}) {
  return (
    <ChoiceMenu label={title} value={value} options={options.map((value) => ({ value, label: labels[value] }))} onChange={change}>
      <SettingsRow icon="palette" title={title} aria-description={detail} trailing={<span className={styles.value}>{detail}</span>} />
    </ChoiceMenu>
  );
}

export function Appearance({ profile, effectiveSpec, setProfile }: AppearanceProps) {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const appearance = useComputedColorScheme(defaultAppearance);
  const seedGroup = useId();
  const { specVersion, contrast } = profile;
  const previews = useMemo(() => seedOptions.map((seed) => {
    const preview = createColorScheme({ seed, scheme: "tonalSpot", specVersion, contrast }, appearance === "dark");
    return { seed, primary: hexFromArgb(preview.primary), secondary: hexFromArgb(preview.secondaryContainer) };
  }), [appearance, specVersion, contrast]);

  return (
    <SegmentedSection title="Material 3 配色">
      <ChoiceRow title="主题" value={colorScheme} options={["auto", "dark", "light"]} change={setColorScheme} />
      <fieldset className={styles.seedField} aria-labelledby={seedGroup}>
        <SettingsRow icon="palette" id={seedGroup} title="种子颜色" detail={labels[profile.seed]} />
        <div className={styles.swatches}>
          {previews.map(({ seed, primary, secondary }) => (
            <label key={seed} title={labels[seed]}>
              <input type="radio" name={seedGroup} aria-label={labels[seed]} checked={profile.seed === seed} onChange={() => setProfile({ ...profile, seed })} />
              <span style={{ background: `linear-gradient(to bottom, ${primary} 50%, ${secondary} 50%)` }} />
            </label>
          ))}
        </div>
      </fieldset>
      <ChoiceRow title="配色规范" value={specVersion} detail={labels[effectiveSpec]} options={specVersions} change={(specVersion) => setProfile({ ...profile, specVersion })} />
      <ChoiceRow title="配色风格" value={profile.scheme} options={schemes} change={(scheme) => setProfile({ ...profile, scheme })} />
      <ChoiceRow title="配色对比度" value={contrast} options={contrasts} change={(contrast) => setProfile({ ...profile, contrast })} />
      <SettingsRow icon="restore" title="恢复默认配色" detail="恢复为：跟随系统 · 蓝灰 · 2025 · 柔和（Tonal Spot） · 标准" action={() => {
        setColorScheme(defaultColorScheme);
        setProfile(defaultColorProfile);
      }} />
    </SegmentedSection>
  );
}
