import { useComputedColorScheme, useMantineColorScheme } from "@mantine/core";
import { hexFromArgb } from "@material/material-color-utilities";
import { useId, useMemo } from "react";
import { ChoiceMenu } from "../m3e/components/atoms/ChoiceMenu";
import { SettingsRow } from "../m3e/components/molecules/SettingsList";
import { SegmentedSection } from "../m3e/components/molecules/SegmentedSection";
import { contrasts, defaultAppearance, defaultColorProfile, defaultColorScheme, schemes, seeds, specVersions, type ColorProfile, type Seed } from "../m3e/theme/colorProfile";
import { createColorScheme } from "../m3e/theme/theme";
import { useI18n } from "../i18n/I18n";
import type { Message, Translate } from "../i18n/messages";
import styles from "./Appearance.module.css";

export type AppearanceProps = {
  profile: ColorProfile;
  effectiveSpec: ColorProfile["specVersion"];
  setProfile: (value: ColorProfile) => void;
};

const seedOptions = Object.keys(seeds) as Seed[];

const labelKeys = {
  auto: "theme.auto", dark: "theme.dark", light: "theme.light",
  slate: "seed.slate", blue: "seed.blue", indigo: "seed.indigo", teal: "seed.teal",
  green: "seed.green", amber: "seed.amber", rose: "seed.rose",
  "2021": "spec.2021", "2025": "spec.2025",
  expressive: "scheme.expressive", tonalSpot: "scheme.tonalSpot", vibrant: "scheme.vibrant",
  neutral: "scheme.neutral", monochrome: "scheme.monochrome", content: "scheme.content",
  fidelity: "scheme.fidelity", fruitSalad: "scheme.fruitSalad", rainbow: "scheme.rainbow",
  standard: "contrast.standard", medium: "contrast.medium", high: "contrast.high",
} as const satisfies Record<string, Message>;

type LabelKey = keyof typeof labelKeys;

function ChoiceRow<T extends LabelKey>({ title, value, options, change, t, detail }: {
  title: Message;
  value: T;
  options: readonly T[];
  change: (value: T) => void;
  t: Translate;
  detail?: string;
}) {
  const shown = detail ?? t(labelKeys[value]);
  return (
    <ChoiceMenu label={t(title)} value={value} options={options.map((value) => ({ value, label: t(labelKeys[value]) }))} onChange={change}>
      <SettingsRow icon="palette" title={t(title)} aria-description={shown} trailing={<span className={styles.value}>{shown}</span>} />
    </ChoiceMenu>
  );
}

export function Appearance({ profile, effectiveSpec, setProfile }: AppearanceProps) {
  const { t } = useI18n();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const appearance = useComputedColorScheme(defaultAppearance);
  const seedGroup = useId();
  const { specVersion, contrast } = profile;
  const previews = useMemo(() => seedOptions.map((seed) => {
    const preview = createColorScheme({ seed, scheme: "tonalSpot", specVersion, contrast }, appearance === "dark");
    return { seed, primary: hexFromArgb(preview.primary), secondary: hexFromArgb(preview.secondaryContainer) };
  }), [appearance, specVersion, contrast]);

  const defaults = t("theme.resetDetail", {
    theme: t(labelKeys[defaultColorScheme]),
    seed: t(labelKeys[defaultColorProfile.seed]),
    spec: t(labelKeys[defaultColorProfile.specVersion]),
    scheme: t(labelKeys[defaultColorProfile.scheme]),
    contrast: t(labelKeys[defaultColorProfile.contrast]),
  });

  return (
    <SegmentedSection title={t("theme.section")}>
      <ChoiceRow t={t} title="theme.theme" value={colorScheme} options={["auto", "dark", "light"]} change={setColorScheme} />
      <fieldset className={styles.seedField} aria-labelledby={seedGroup}>
        <SettingsRow icon="palette" id={seedGroup} title={t("theme.seed")} detail={t(labelKeys[profile.seed])} />
        <div className={styles.swatches}>
          {previews.map(({ seed, primary, secondary }) => (
            <label key={seed} title={t(labelKeys[seed])}>
              <input type="radio" name={seedGroup} aria-label={t(labelKeys[seed])} checked={profile.seed === seed} onChange={() => setProfile({ ...profile, seed })} />
              <span style={{ background: `linear-gradient(to bottom, ${primary} 50%, ${secondary} 50%)` }} />
            </label>
          ))}
        </div>
      </fieldset>
      <ChoiceRow t={t} title="theme.spec" value={specVersion} detail={t(labelKeys[effectiveSpec])} options={specVersions} change={(specVersion) => setProfile({ ...profile, specVersion })} />
      <ChoiceRow t={t} title="theme.scheme" value={profile.scheme} options={schemes} change={(scheme) => setProfile({ ...profile, scheme })} />
      <ChoiceRow t={t} title="theme.contrast" value={contrast} options={contrasts} change={(contrast) => setProfile({ ...profile, contrast })} />
      <SettingsRow icon="restore" title={t("theme.reset")} detail={defaults} action={() => {
        setColorScheme(defaultColorScheme);
        setProfile(defaultColorProfile);
      }} />
    </SegmentedSection>
  );
}
