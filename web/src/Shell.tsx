import { type ReactNode, useLayoutEffect, useRef } from "react";
import { Icon } from "./m3e/components/atoms/Icon";
import { syncAppBar } from "./m3e/components/molecules/FlexiblePageHeader";
import { useI18n } from "./i18n/I18n";
import type { Message } from "./i18n/messages";
import styles from "./m3e/layout/Shell.module.css";

export type Route = "/" | "/apps" | "/apps/modes" | "/logs" | "/settings";

const links = [
  { path: "/", icon: "home", label: "nav.home" },
  { path: "/apps", icon: "apps", label: "nav.apps" },
  { path: "/logs", icon: "logs", label: "nav.logs" },
  { path: "/settings", icon: "settings", label: "nav.settings" },
] as const satisfies readonly { path: Route; icon: "home" | "apps" | "logs" | "settings"; label: Message }[];

/**
 * Layout shell: a scrollable M3E surface with a
 * bottom (phone) / rail (>=840px) navigation bar. The flexible app bar height
 * is driven by `syncAppBar` from the vendored component library.
 */
export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const { t } = useI18n();
  const secondary = route.startsWith("/apps/");
  const main = useRef<HTMLElement>(null);
  const positions = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const content = main.current;
    if (!content) return;
    content.scrollTop = positions.current.get(route) ?? 0;
    syncAppBar(content, content.scrollTop);
    const remember = () => {
      positions.current.set(route, content.scrollTop);
      syncAppBar(content, content.scrollTop);
    };
    content.addEventListener("scroll", remember, { passive: true });
    return () => content.removeEventListener("scroll", remember);
  }, [route]);

  return (
    <div
      className={styles.shell}
      data-flexible="true"
      data-home={route === "/"}
      data-secondary={secondary || undefined}
      data-testid="shell"
    >
      <button
        type="button"
        className={styles.skip}
        onClick={() => main.current?.focus()}
      >
        {t("nav.skip")}
      </button>
      {!secondary && <nav className={styles.nav} aria-label={t("nav.label")}>
        {links.map((link) => {
          const active = route === link.path || (link.path === "/apps" && route.startsWith("/apps/"));
          return (
            <a
              key={link.path}
              href={`#${link.path}`}
              aria-current={active ? "page" : undefined}
            >
              <span className={styles.pill}>
                <Icon name={link.icon} filled={active} />
              </span>
              <span>{t(link.label)}</span>
            </a>
          );
        })}
      </nav>}
      <main ref={main} tabIndex={-1} className={styles.main}>
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}
