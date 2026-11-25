import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import styles from "./Snackbar.module.css";

type Tone = "default" | "error";
type Item = { id: number; text: string; tone: Tone };

const SnackbarContext = createContext<(text: string, tone?: Tone) => void>(() => {});
export const useSnackbar = () => useContext(SnackbarContext);

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const seq = useRef(0);
  const timers = useMemo(() => new Map<number, number>(), []);

  const push = useCallback(
    (text: string, tone: Tone = "default") => {
      const id = ++seq.current;
      setItems((prev) => [...prev.slice(-2), { id, text, tone }]);
      const timer = window.setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== id));
        timers.delete(id);
      }, 2800);
      timers.set(id, timer);
    },
    [timers],
  );

  useEffect(() => {
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, [timers]);

  return (
    <SnackbarContext.Provider value={push}>
      {children}
      <div className={styles.viewport} aria-live="polite" aria-atomic="false">
        {items.map((item) => (
          <div key={item.id} className={styles.snack} data-tone={item.tone} role="status">
            {item.text}
          </div>
        ))}
      </div>
    </SnackbarContext.Provider>
  );
}
