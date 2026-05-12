import { useEffect } from "react";
import type { MouseEvent } from "react";
import { SOCKET_URL as BASE_URL } from "../config";
import { fileIcon } from "../utils/fileUtils";
import { s } from "./chatAreaStyles";

const OFFICE_EXTS = ["ppt", "pptx", "doc", "docx", "xls", "xlsx"];

type Props = {
  fileUrl:   string;
  fileType?: string | null;
  fileName?: string | null;
  onClose:   () => void;
};

/**
 * Full-screen overlay for viewing or downloading a file attachment.
 * Images are shown inline; PDFs/Office docs in iframes; other types show a download button.
 * Pressing Escape or clicking the backdrop closes the modal.
 */
export default function FilePreviewModal({ fileUrl, fileType, fileName, onClose }: Props) {
  const fullUrl     = `${BASE_URL}${fileUrl}`;
  const isImage     = fileType === "image";
  const lowerName   = (fileName || "").toLowerCase();
  const isPdf       = lowerName.endsWith(".pdf");
  const isOfficeDoc = OFFICE_EXTS.some((ext) => lowerName.endsWith(`.${ext}`));

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
      URL.revokeObjectURL(href);
    } catch {
      window.open(fullUrl, "_blank");
    }
  }

  return (
    <div style={s.modalOverlay} onClick={onClose}>
      <div style={s.modalBox} onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <span style={s.modalTitle}>{fileName}</span>
          <button style={s.modalClose} onClick={onClose} title="Close (Esc)">✕</button>
        </div>

        {isImage ? (
          <img src={fullUrl} alt={fileName} style={s.modalImg} />
        ) : isPdf ? (
          <iframe src={fullUrl} title={fileName} style={{ width: "75vw", height: "68vh", borderRadius: "8px", border: "none" }} />
        ) : isOfficeDoc ? (
          <iframe
            src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fullUrl)}`}
            title={fileName}
            style={{ width: "75vw", height: "68vh", borderRadius: "8px", border: "none" }}
          />
        ) : (
          <>
            <div style={s.modalFileIcon}>{fileIcon(fileName)}</div>
            <div style={s.modalFileMeta}>{fileName}</div>
          </>
        )}

        <div style={s.modalActions}>
          <button style={s.downloadBtn} onClick={handleDownload}>⬇ Download</button>
          <a
            href={fullUrl} target="_blank" rel="noreferrer"
            style={{ ...s.downloadBtn, background: "#2d2d3f", color: "#949ba4" }}
            onClick={(e: MouseEvent<HTMLAnchorElement>) => e.stopPropagation()}
          >
            🔗 Open
          </a>
        </div>
      </div>
    </div>
  );
}