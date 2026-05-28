/**
 * File utility helpers for displaying file attachments in the message UI.
 *
 * Used by: MessageRow.tsx (file attachment rendering), MessageInput.tsx (upload preview).
 */

/**
 * Returns a short label representing the file type based on the file extension.
 * Used as the visible badge when displaying non-image file attachments.
 *
 * @param filename - The file name (including extension). Null/undefined treated as empty string.
 * @returns        A 3-letter uppercase type label, or "FILE" for unrecognised extensions.
 *
 * @example
 * fileIcon("report.pdf")    // → "PDF"
 * fileIcon("data.xlsx")     // → "XLS"
 * fileIcon("archive.zip")   // → "ZIP"
 * fileIcon("unknown.xyz")   // → "FILE"
 */
export function fileIcon(filename: string | null | undefined = "") {
  const ext = (filename || "").split(".").pop()?.toLowerCase() || "";
  if (["pdf"].includes(ext)) return "PDF";
  if (["doc", "docx"].includes(ext)) return "DOC";
  if (["xls", "xlsx", "csv"].includes(ext)) return "XLS";
  if (["ppt", "pptx"].includes(ext)) return "PPT";
  if (["zip", "rar", "7z"].includes(ext)) return "ZIP";
  if (["txt"].includes(ext)) return "TXT";
  return "FILE";
}

/**
 * Formats a byte count as a human-readable string (B, KB, or MB).
 *
 * @param bytes - Raw byte count. Null/undefined returns an empty string.
 * @returns     Formatted string, e.g. "2.5 MB", "512 KB", "128 B".
 *
 * @example
 * formatBytes(1024)          // → "1.0 KB"
 * formatBytes(1048576)       // → "1.0 MB"
 * formatBytes(null)          // → ""
 */
export function formatBytes(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
