import { useEffect, useState } from "react";

// Preserves the exact load/save behavior both call sites had before this was
// extracted: load once on mount, discarding (and clearing) anything that
// fails to parse; persist on every change. `parse`/`serialize` let callers
// keep their own on-disk shape and coercion instead of forcing one here.
export function useLocalStorageState<T>(
  key: string,
  defaultValue: T,
  options?: {
    parse?: (raw: string) => T;
    serialize?: (value: T) => string;
  },
) {
  const parse = options?.parse ?? ((raw: string) => JSON.parse(raw) as T);
  const serialize = options?.serialize ?? ((value: T) => JSON.stringify(value));

  const [value, setValue] = useState<T>(defaultValue);

  useEffect(() => {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      setValue(parse(raw));
    } catch {
      localStorage.removeItem(key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(key, serialize(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return [value, setValue] as const;
}
