/** Returns an emoji icon appropriate for a file's extension. */
export function fileIcon(filename: string | null | undefined = "") {
  const ext = (filename || "").split(".").pop()?.toLowerCase() || "";
  if (["pdf"].includes(ext))              return "📄";
  if (["doc", "docx"].includes(ext))     return "📝";
  if (["xls", "xlsx", "csv"].includes(ext)) return "📊";
  if (["ppt", "pptx"].includes(ext))    return "📑";
  if (["zip", "rar", "7z"].includes(ext)) return "🗜️";
  if (["txt"].includes(ext))             return "📃";
  return "📎";
}

/** Formats a byte count as a human-readable string (B / KB / MB). */
export function formatBytes(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}