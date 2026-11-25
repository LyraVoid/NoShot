import { type ReactNode, useLayoutEffect, useRef } from "react";
import { Icon } from "./m3e/components/atoms/Icon";
import { syncAppBar } from "./m3e/components/molecules/FlexiblePageHeader";
import styles from "./m3e/layout/Shell.module.css";

export type Route = "/" | "/apps" | "/logs" | "/settings";

const links = [
  { path: "/", icon: "home", label: "首页" },
  { path: "/apps", icon: "apps", label: "应用" },
  { path: "/logs", icon: "logs", label: "日志" },
  { path: "/settings", icon: "settings", label: "设置" },
] as const;

/**
 * Layout shell: a scrollable M3E surface with a
 * bottom (phone) / rail (>=840px) navigation bar. The flexible app bar height
 * is driven by `syncAppBar` from the vendored component library.
 */
export function Shell({ route, children }: { route: Route; children: ReactNode }) {
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
      data-testid="shell"
    >
      <button
        type="button"
        className={styles.skip}
        onClick={() => main.current?.focus()}
      >
        跳到内容
      </button>
      <nav className={styles.nav} aria-label="主导航">
        {links.map((link) => {
          const active = route === link.path;
          return (
            <a
              key={link.path}
              href={`#${link.path}`}
              aria-current={active ? "page" : undefined}
            >
              <span className={styles.pill}>
                <Icon name={link.icon} filled={active} />
              </span>
              <span>{link.label}</span>
            </a>
          );
        })}
      </nav>
      <main ref={main} tabIndex={-1} className={styles.main}>
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}
