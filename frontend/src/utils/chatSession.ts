export function saveSession(channelId?: number | null, dmUserId?: number | null) {
  try {
    sessionStorage.setItem("im_session", JSON.stringify({ channelId: channelId ?? null, dmUserId: dmUserId ?? null }));
  } catch {}
}

export function loadSession(): { channelId?: number; dmUserId?: number } {
  try { return JSON.parse(sessionStorage.getItem("im_session") || "{}"); } catch { return {}; }
}