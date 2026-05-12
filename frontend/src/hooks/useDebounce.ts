import { useRef, useCallback } from "react";

export function useDebounce<TArgs extends unknown[]>(fn: (...args: TArgs) => void, delay: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback((...args: TArgs) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}