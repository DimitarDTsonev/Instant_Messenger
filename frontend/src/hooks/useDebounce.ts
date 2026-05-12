import { useRef, useCallback } from "react";

/** Returns a debounced version of the callback. Each call resets the timer; callback fires after `delay` ms of inactivity. */
export function useDebounce<TArgs extends unknown[]>(fn: (...args: TArgs) => void, delay: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback((...args: TArgs) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}