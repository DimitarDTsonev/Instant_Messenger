/**
 * File preview modal — renders uploaded files in an overlay dialog.
 *
 * Rendering strategy based on file type:
 *  - `"image"` (`fileType === "image"`) — `<img>` tag for inline preview.
 *  - PDF (`.pdf` filename) — `<iframe>` with the direct file URL.
 *  - Office documents (`.ppt`, `.pptx`, `.doc`, `.docx`, `.xls`, `.xlsx`) —
 *    `<iframe>` via the Microsoft Office Online viewer (`view.officeapps.live.com`).
 *  - Everything else — icon + filename with a download button only.
 *
 * Interaction:
 *  - Clicking the overlay backdrop calls `onClose`.
 *  - Pressing `Escape` also calls `onClose`.
 *  - The "Download" button fetches the file as a `Blob` and triggers a programmatic
 *    `<a download>` click to bypass browser "open in new tab" behaviour.
 *    Falls back to `window.open` if the fetch fails.
 *
 * Used by: MessageRow.tsx (triggered when user clicks an attachment thumbnail).
 */

import { useEffect } from "react";
import type { MouseEvent } from "react";
import { SOCKET_URL as BASE_URL } from "../config";
import { fileIcon } from "../utils/fileUtils";
import { s } from "./chatAreaStyles";
import Icon from "./Icons";

/** File extensions handled by the Office Online viewer. */
const OFFICE_EXTS = ["ppt", "pptx", "doc", "docx", "xls", "xlsx"];

type Props = {
  /** Relative file path, e.g. `/uploads/1714900000000-k3j7z9.png`. */
  fileUrl:   string;
  /** `"image"` for inline images, anything else for document/file treatment. */
  fileType?: string | null;
  /** Original filename; used as the `<img alt>` and download filename. */
  fileName?: string | null;
  /** Called when the modal should close. */
  onClose:   () => void;
};

/**
 * Renders a full-screen modal overlay with a file preview.
 *
 * @param fileUrl  - Relative URL of the uploaded file.
 * @param fileType - `"image"` or a generic file type string.
 * @param fileName - Original filename for display and download.
 * @param onClose  - Callback to dismiss the modal.
 */
export default function FilePreviewModal({ fileUrl, fileType, fileName, onClose }: Props) {
  /** Absolute URL for the file (prepends the backend base URL). */
  const fullUrl     = `${BASE_URL}${fileUrl}`;
  const isImage     = fileType === "image";
  const lowerName   = (fileName || "").toLowerCase();
  const isPdf       = lowerName.endsWith(".pdf");
  const isOfficeDoc = OFFICE_EXTS.some((ext) => lowerName.endsWith(`.${ext}`));

  // Close on Escape key
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /**
   * Fetches the file as a `Blob` and triggers a programmatic download.
   * Falls back to `window.open` if the fetch fails (e.g. CORS, network error).
   *
   * Built-ins used: `fetch`, `Response.blob`, `URL.createObjectURL`,
   *                 `URL.revokeObjectURL`, `document.createElement`.
   */
  async function handleDownload(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    try {
      const res  = await fetch(fullUrl);
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = href;
      a.download = fileName || "file";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(href); // Release the object URL after use
    } catch {
      window.open(fullUrl, "_blank");
    }
  }

  return (
    // Clicking the backdrop closes the modal
    <div style={s.modalOverlay} onClick={onClose}>
      {/* stopPropagation prevents backdrop click from firing when clicking inside */}
      <div style={s.modalBox} onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <span style={s.modalTitle}>{fileName}</span>
          <button style={s.modalClose} onClick={onClose} title="Close (Esc)" aria-label="Close preview">
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Render the appropriate preview based on file type */}
        {isImage ? (
          <img src={fullUrl} alt={fileName} style={s.modalImg} />
        ) : isPdf ? (
          <iframe src={fullUrl} title={fileName} style={{ width: "75vw", height: "68vh", borderRadius: "8px", border: "none" }} />
        ) : isOfficeDoc ? (
          // Office Online viewer — encodes the full URL as a query parameter
          <iframe
            src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fullUrl)}`}
            title={fileName}
            style={{ width: "75vw", height: "68vh", borderRadius: "8px", border: "none" }}
          />
        ) : (
          // Generic file — show icon and filename with download/open actions
          <>
            <div style={s.modalFileIcon}>{fileIcon(fileName)}</div>
            <div style={s.modalFileMeta}>{fileName}</div>
          </>
        )}

        <div style={s.modalActions}>
          <button style={s.downloadBtn} onClick={handleDownload}>
            <Icon name="download" size={16} />
            <span>Download</span>
          </button>
          <a
            href={fullUrl} target="_blank" rel="noreferrer"
            style={{ ...s.downloadBtn, background: "#2d2d3f", color: "#949ba4" }}
            onClick={(e: MouseEvent<HTMLAnchorElement>) => e.stopPropagation()}
          >
            <Icon name="externalLink" size={16} />
            <span>Open</span>
          </a>
        </div>
      </div>
    </div>
  );
}
