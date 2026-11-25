export type AppEntry = {
  pkg: string;
  label: string;
  version?: string;
  system?: boolean;
  /** Android user ids the package is installed for (0, 10, 999, ...) */
  users: number[];
  /** selected in config but not installed right now */
  missing?: boolean;
};

export type Settings = {
  flagSecure: boolean;
  surfaceSecure: boolean;
  detectGuard: boolean;
  log: boolean;
};

export type ZygiskStatus = {
  host: "active" | "present" | "unknown";
  module: "loaded" | "installed" | "disabled" | "missing" | "unknown";
};

export type ToastTone = "default" | "error";

export type ToastItem = { id: number; text: string; tone: ToastTone };
