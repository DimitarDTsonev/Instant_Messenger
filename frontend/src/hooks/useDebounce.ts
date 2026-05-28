/**
 * Generic debounce hook using `useRef` + `setTimeout`.
 *
 * Returns a stable memoised wrapper around `fn` that delays invocation until
 * `delay` ms have passed since the last call. Each new call resets the timer.
 *
 * Used by: SearchModal.tsx, MessageInput.tsx (typing indicators), any input
 *          that should defer expensive work until the user stops typing.
 */

import { useRef, useCallback } from "react";

/**
 * Wraps a function so it only executes after `delay` ms of silence.
 *
 * Uses `useRef` to hold the pending `setTimeout` handle so it persists across
 * renders without causing re-renders itself. Uses `useCallback([fn, delay])`
 * so the wrapper is recreated only when `fn` or `delay` changes.
 *
 * Built-ins used: `setTimeout`, `clearTimeout`, `useRef`, `useCallback`.
 *
 * @param fn    - The function to debounce.
 * @param delay - Milliseconds to wait after the last call before invoking `fn`.
 * @returns     A debounced version of `fn` with the same parameter types.
 *
 * @example
 * const debouncedSearch = useDebounce((q: string) => search(q), 300);
 * // Called on every keystroke; actual search fires 300 ms after the last key press
 */
export function useDebounce<TArgs extends unknown[]>(fn: (...args: TArgs) => void, delay: number) {
  /** Holds the ID of the pending setTimeout so it can be cancelled on each new call. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback((...args: TArgs) => {
    // Cancel the previous pending call
    if (timer.current) clearTimeout(timer.current);
    // Schedule a new call after the delay window
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}
