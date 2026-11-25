import { Alert, Button, Skeleton, TextInput } from "@mantine/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSnackbar } from "../Snackbar";
import { Icon } from "../m3e/components/atoms/Icon";
import { ChoiceMenu } from "../m3e/components/atoms/ChoiceMenu";
import { FlexiblePageHeader } from "../m3e/components/molecules/FlexiblePageHeader";
import { DialogActions, M3eDialog } from "../m3e/components/molecules/M3eDialog";
import {
  SettingsList,
  SettingsRow,
} from "../m3e/components/molecules/SettingsList";
import {
  isDemo,
  loadApps,
  loadConf,
  saveConf,
  stopApps,
} from "../lib/bridge";
import { monogram } from "../lib/labels";
import type { AppEntry } from "../lib/types";
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
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initial, setInitial] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stoping, setStoping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stopOpen, setStopOpen] = useState(false);

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
      setError(caught instanceof Error ? caught.message : "加载失败");
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

  const cloneSelected = useMemo(
    () =>
      [...selected].filter(
        (pkg) => (apps.find((app) => app.pkg === pkg)?.users.length ?? 0) > 1,
      ).length,
    [selected, apps],
  );

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
        snack("保存失败：所有写入通道都未生效", "error");
        return;
      }
      setInitial(new Set(selected));
      snack(`已保存 ${selected.size} 个应用`);
    } catch {
      snack("保存失败，请重试", "error");
    } finally {
      setBusy(false);
    }
  };

  const stopSelected = async () => {
    setStoping(true);
    try {
      const users = new Map(apps.map((app) => [app.pkg, app.users]));
      const count = await stopApps([...selected], users);
      setStopOpen(false);
      snack(count > 0 ? `已停止 ${selected.size} 个应用` : "没有需要停止的应用");
    } catch {
      snack("停止应用失败", "error");
    } finally {
      setStoping(false);
    }
  };

  return (
    <>
      <FlexiblePageHeader
        title="应用"
        aside={(
          <ChoiceMenu<Filter>
            label="应用筛选"
            value={filter}
            options={[
              { value: "all", label: "全部" },
              { value: "selected", label: "已选" },
              { value: "clone", label: "分身" },
            ]}
            onChange={setFilter}
          >
            <button type="button" className={styles.overflow} aria-label="应用筛选">
              <Icon name="more" />
            </button>
          </ChoiceMenu>
        )}
      />

      <div className={styles.page} data-saving-space={dirty || busy}>
        {error && (
          <Alert color="danger" variant="light" title="加载应用列表失败">
            {error}。请确认 WebUI 拥有 root 权限。
          </Alert>
        )}

        <TextInput
          aria-label="搜索应用名或包名"
          classNames={{ input: styles.searchInput }}
          leftSection={<Icon name="search" />}
          placeholder="搜索应用名或包名"
          radius={28}
          rightSection={
            query ? (
              <button
                type="button"
                className={styles.searchClear}
                aria-label="清除搜索"
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
            {filter === "all" ? "全部应用" : filter === "selected" ? "已选应用" : "分身应用"}
            <span className={styles.count}>{filtered.length}</span>
          </h2>
        )}

        {loading ? (
          <SettingsList label="正在加载应用">
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
              {apps.length === 0 ? "没有可显示的应用" : "没有匹配的应用"}
            </p>
            <p className={styles.emptyBody}>
              {apps.length === 0
                ? "请确认 WebUI 拥有 root 权限，且允许执行 pm 命令。"
                : "换个关键词，或切换筛选条件。"}
            </p>
            {apps.length === 0 && (
              <Button variant="subtle" onClick={() => void bootstrap()}>
                重新加载
              </Button>
            )}
          </div>
        ) : (
          <SettingsList label="应用列表">
            {filtered.map((app) => {
              const checked = selected.has(app.pkg);
              const meta = [
                app.users.length > 1 ? `分身 ×${app.users.length}` : "",
                app.missing ? "未安装" : "",
              ].filter(Boolean);
              return (
                <SettingsRow
                  key={app.pkg}
                  action={() => toggle(app.pkg)}
                  checked={checked}
                  className={`${styles.appRow} ${checked ? styles.selected : ""}`}
                  detail={`${app.pkg}${meta.length ? ` · ${meta.join(" · ")}` : ""}`}
                  aria-description={`${checked ? "已勾选" : "未勾选"} · ${app.pkg}`}
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

        {selected.size > 0 && (
          <div className={styles.secondaryAction}>
            <Button variant="subtle" onClick={() => setStopOpen(true)}>
              停止已选应用
            </Button>
          </div>
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
        <span>{busy ? "保存中" : "保存"}</span>
      </button>}

      <M3eDialog
        opened={stopOpen}
        onClose={() => setStopOpen(false)}
        title="停止已选应用？"
      >
        <p className={styles.dialogText}>
          将停止已选的 <strong>{selected.size}</strong> 个应用
          {cloneSelected > 0 ? `（含 ${cloneSelected} 个分身份例）` : ""}。
          分身按各自用户单独停止；下次打开应用时配置才会生效。
        </p>
        <p className={styles.dialogText}>
          停止不是必须的：也可以从最近任务划掉应用。
        </p>
        <DialogActions>
          <Button variant="subtle" onClick={() => setStopOpen(false)}>
            取消
          </Button>
          <Button variant="subtle" loading={stoping} onClick={() => void stopSelected()}>
            是，停止
          </Button>
        </DialogActions>
      </M3eDialog>

    </>
  );
}
