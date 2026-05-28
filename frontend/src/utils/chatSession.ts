/**
 * Chat session persistence utilities using `sessionStorage`.
 *
 * Saves and restores the last active channel or DM conversation so the
 * user returns to the same view after a page refresh (within the same
 * browser tab). `sessionStorage` is used rather than `localStorage` so
 * the session is cleared when the tab is closed.
 *
 * Used by: pages/ChatPage.tsx (on mount to restore last view).
 */

/**
 * Persists the current active channel or DM partner to `sessionStorage`.
 *
 * At most one of `channelId` or `dmUserId` should be set at a time.
 *
 * @param channelId - ID of the active channel, or `null` if a DM is active.
 * @param dmUserId  - ID of the active DM partner, or `null` if a channel is active.
 *
 * Built-ins used: `sessionStorage.setItem`, `JSON.stringify`.
 */
export function saveSession(channelId?: number | null, dmUserId?: number | null) {
  try {
    sessionStorage.setItem("im_session", JSON.stringify({ channelId: channelId ?? null, dmUserId: dmUserId ?? null }));
  } catch {}
}

/**
 * Restores the previously saved active channel or DM from `sessionStorage`.
 * Returns an empty object if no session was saved or the data is malformed.
 *
 * @returns `{ channelId?, dmUserId? }` — whichever was last saved.
 *
 * Built-ins used: `sessionStorage.getItem`, `JSON.parse`.
 */
export function loadSession(): { channelId?: number; dmUserId?: number } {
  try { return JSON.parse(sessionStorage.getItem("im_session") || "{}"); } catch { return {}; }
}
