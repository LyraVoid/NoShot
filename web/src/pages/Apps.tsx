import { Alert, Button, Skeleton, TextInput } from "@mantine/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSnackbar } from "../Snackbar";
import { Icon } from "../m3e/components/atoms/Icon";
import { ChoiceMenu } from "../m3e/components/atoms/ChoiceMenu";
import { FlexiblePageHeader } from "../m3e/components/molecules/FlexiblePageHeader";
import {
  SettingsList,
  SettingsRow,
} from "../m3e/components/molecules/SettingsList";
import {
  isDemo,
  loadApps,
  loadConf,
  saveConf,
} from "../lib/bridge";
import { monogram } from "../lib/labels";
import type { AppEntry } from "../lib/types";
import { useI18n } from "../i18n/I18n";
import styles from "./Apps.module.css";

type Filter = "all" | "selected" | "clone";

function mergeApps(list: AppEntry[], selected: Set<string>): AppEntry[] {
  const merged = [...list];
  const known = new Set(list.map((app) => app.pkg));
  for (const pkg of selected) {
    if (!known.has(pkg)) merged.push({ pkg, label: pkg, users: [0], missing: true });
  }
  return merged;
}

function AppIcon({ app }: { app: AppEntry }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={styles.avatar} aria-hidden="true">
      {isDemo || app.missing || failed ? monogram(app.label) : (
        <img src={`ksu://icon/${encodeURIComponent(app.pkg)}`} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      )}
    </span>
  );
}

export function Apps() {
  const snack = useSnackbar();
  const { t } = useI18n();
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initial, setInitial] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, conf] = await Promise.all([
        loadApps(),
        loadConf(),
      ]);
      setApps(mergeApps(list, conf.pkgs));
      setSelected(new Set(conf.pkgs));
      setInitial(new Set(conf.pkgs));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("apps.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const dirty = useMemo(() => {
    if (selected.size !== initial.size) return true;
    for (const pkg of selected) if (!initial.has(pkg)) return true;
    return false;
  }, [selected, initial]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return apps.filter((app) => {
      if (filter === "selected" && !selected.has(app.pkg)) return false;
      if (filter === "clone" && app.users.length < 2) return false;
      if (!needle) return true;
      return (
        app.label.toLowerCase().includes(needle) ||
        app.pkg.toLowerCase().includes(needle)
      );
    });
  }, [apps, query, filter, selected]);

  const toggle = (pkg: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(pkg)) next.delete(pkg);
      else next.add(pkg);
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      const path = await saveConf(selected);
      if (!path) {
        snack(t("apps.saveFail"), "error");
        return;
      }
      setInitial(new Set(selected));
    } catch {
      snack(t("apps.saveFailRetry"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <FlexiblePageHeader
        title={t("apps.title")}
        aside={(
          <ChoiceMenu<Filter>
            label={t("apps.filter")}
            value={filter}
            options={[
              { value: "all", label: t("apps.all") },
              { value: "selected", label: t("apps.selected") },
              { value: "clone", label: t("apps.clone") },
            ]}
            onChange={setFilter}
          >
            <button type="button" className={styles.overflow} aria-label={t("apps.filter")}>
              <Icon name="more" />
            </button>
          </ChoiceMenu>
        )}
      />

      <div className={styles.page} data-saving-space={dirty || busy}>
        {error && (
          <Alert color="danger" variant="light" title={t("apps.alertTitle")}>
            {t("apps.alertBody", { message: error })}
          </Alert>
        )}

        <TextInput
          aria-label={t("apps.search")}
          classNames={{ input: styles.searchInput }}
          leftSection={<Icon name="search" />}
          placeholder={t("apps.search")}
          radius={28}
          rightSection={
            query ? (
              <button
                type="button"
                className={styles.searchClear}
                aria-label={t("apps.clearSearch")}
                onClick={() => setQuery("")}
              >
                <Icon name="close" />
              </button>
            ) : null
          }
          size="md"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />

        {!loading && (
          <h2 className={styles.listHead}>
            {filter === "all" ? t("apps.headAll") : filter === "selected" ? t("apps.headSelected") : t("apps.headClone")}
            <span className={styles.count}>{filtered.length}</span>
          </h2>
        )}

        {loading ? (
          <SettingsList label={t("apps.loadingList")}>
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className={styles.skeletonRow}>
                <Skeleton circle height={40} />
                <div className={styles.skeletonCopy}>
                  <Skeleton height={14} width="42%" radius="xl" />
                  <Skeleton height={10} width="66%" radius="xl" />
                </div>
                <Skeleton circle height={24} />
              </div>
            ))}
          </SettingsList>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <Icon name={apps.length === 0 ? "missing" : "search"} />
            </span>
            <p className={styles.emptyTitle}>
              {apps.length === 0 ? t("apps.emptyNone") : t("apps.emptyNoMatch")}
            </p>
            <p className={styles.emptyBody}>
              {apps.length === 0 ? t("apps.emptyRootHint") : t("apps.emptyHint")}
            </p>
            {apps.length === 0 && (
              <Button variant="subtle" onClick={() => void bootstrap()}>
                {t("apps.reload")}
              </Button>
            )}
          </div>
        ) : (
          <SettingsList label={t("apps.list")}>
            {filtered.map((app) => {
              const checked = selected.has(app.pkg);
              const meta = [
                app.users.length > 1 ? t("apps.cloneMeta", { n: app.users.length }) : "",
                app.missing ? t("apps.notInstalled") : "",
              ].filter(Boolean);
              return (
                <SettingsRow
                  key={app.pkg}
                  action={() => toggle(app.pkg)}
                  checked={checked}
                  className={`${styles.appRow} ${checked ? styles.selected : ""}`}
                  detail={`${app.pkg}${meta.length ? ` · ${meta.join(" · ")}` : ""}`}
                  aria-description={`${checked ? t("apps.checked") : t("apps.unchecked")} · ${app.pkg}`}
                  leading={<AppIcon app={app} />}
                  title={app.label}
                  trailing={
                    <span className={styles.ring} data-on={checked} aria-hidden="true">
                      <Icon name="check" />
                    </span>
                  }
                />
              );
            })}
          </SettingsList>
        )}

      </div>

      {(dirty || busy) && <button
        type="button"
        className={styles.fab}
        disabled={busy}
        onClick={() => void save()}
      >
        {busy ? (
          <span className={styles.spin}>
            <Icon name="loading" />
          </span>
        ) : (
          <Icon name="check" />
        )}
        <span>{busy ? t("apps.saving") : t("apps.save")}</span>
      </button>}

    </>
  );
}
