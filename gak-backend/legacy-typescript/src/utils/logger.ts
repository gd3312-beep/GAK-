export const logger = {
  info: (message: string, payload?: unknown): void => {
    console.log(`[INFO] ${message}`, payload ?? "");
  },
  warn: (message: string, payload?: unknown): void => {
    console.warn(`[WARN] ${message}`, payload ?? "");
  },
  error: (message: string, payload?: unknown): void => {
    console.error(`[ERROR] ${message}`, payload ?? "");
  }
};
