import { Menu, Portal } from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import {
  cloneElement,
  type MouseEventHandler,
  type ReactElement,
  useState,
} from "react";
import menuStyles from "./ChoiceMenu.module.css";

export type MenuAction = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
};

/**
 * Overflow menu for actions. Shares the visual rules of `ChoiceMenu` but never
 * renders selection marks, so the items stay plain menu entries.
 */
export function ActionMenu({
  label,
  items,
  children,
}: {
  label: string;
  items: readonly MenuAction[];
  children: ReactElement<{ onClick?: MouseEventHandler<HTMLButtonElement> }>;
}) {
  const reduceMotion = useReducedMotion();
  const [opened, setOpened] = useState(false);
  const [anchor, setAnchor] = useState<{
    above: boolean;
    mainAxis: number;
    crossAxis: number;
  }>();
  return (
    <>
      {opened && (
        <Portal>
          <div
            className={menuStyles.dismiss}
            aria-hidden="true"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => setOpened(false)}
          />
        </Portal>
      )}
      <Menu
        opened={opened}
        onChange={setOpened}
        closeOnClickOutside={false}
        position={anchor ? (anchor.above ? "top-start" : "bottom-start") : "bottom-end"}
        floatingStrategy="fixed"
        offset={anchor ?? 4}
        returnFocus
        withInitialFocusPlaceholder={false}
        middlewares={{
          flip: anchor ? false : { padding: 16 },
          shift: { padding: 16 },
          size: {
            padding: 16,
            apply: ({ elements, availableHeight }) => {
              elements.floating.style.setProperty(
                "--menu-room",
                `${Math.max(0, availableHeight)}px`,
              );
            },
          },
        }}
        transitionProps={{
          transition: "pop",
          duration: reduceMotion ? 0 : 150,
        }}
        classNames={{
          dropdown: menuStyles.menu,
          item: menuStyles.item,
          itemLabel: menuStyles.label,
        }}
      >
        <Menu.Target>
          {cloneElement(children, {
            onClick: (event) => {
              children.props.onClick?.(event);
              if (event.detail === 0) {
                setAnchor(undefined);
                return;
              }
              const bounds = event.currentTarget.getBoundingClientRect();
              const below = window.innerHeight - event.clientY;
              const preferredHeight = Math.min(304, 8 + items.length * 50);
              const above =
                below < Math.min(preferredHeight + 20, event.clientY);
              setAnchor({
                above,
                crossAxis: event.clientX - bounds.left,
                mainAxis:
                  4 +
                  (above
                    ? bounds.top - event.clientY
                    : event.clientY - bounds.bottom),
              });
            },
          })}
        </Menu.Target>
        <Menu.Dropdown aria-label={label}>
          {items.map((item) => (
            <Menu.Item
              key={item.label}
              disabled={item.disabled}
              onClick={item.onSelect}
            >
              <span>{item.label}</span>
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </>
  );
}
