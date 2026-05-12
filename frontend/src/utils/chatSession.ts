/** Persists the current channel/DM selection to sessionStorage. */
export function saveSession(channelId?: number | null, dmUserId?: number | null) {
  try {
    sessionStorage.setItem("im_session", JSON.stringify({ channelId: channelId ?? null, dmUserId: dmUserId ?? null }));
  } catch {}
}

/** Reads the previously saved channel/DM selection from sessionStorage. */
export function loadSession(): { channelId?: number; dmUserId?: number } {
  try { return JSON.parse(sessionStorage.getItem("im_session") || "{}"); } catch { return {}; }
}