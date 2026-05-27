import type { Message } from "../types";

type MusicMetadata = {
  integration?: string;
  title?: string;
  artist?: string;
  album?: string;
  albumArt?: string;
  releaseYear?: string;
  durationMs?: number;
  score?: number;
  spotifyUrl?: string;
  youtubeUrl?: string;
  youtubeViewCount?: number;
  youtubeUnavailable?: boolean;
  scoringDetails?: {
    spotifyPopularity?: number;
    youtubeViewScore?: number;
    releaseRecencyBoost?: number;
    matchQualityScore?: number;
  };
};

const styles = {
  card: {
    marginTop: "4px",
    width: "min(520px, 100%)",
    border: "1px solid #2f3b52",
    borderRadius: "8px",
    background: "#111827",
    overflow: "hidden",
  },
  body: {
    display: "grid",
    gridTemplateColumns: "86px minmax(0, 1fr)",
    gap: "12px",
    padding: "12px",
  },
  art: {
    width: "86px",
    height: "86px",
    borderRadius: "6px",
    objectFit: "cover",
    background: "#202938",
  },
  artFallback: {
    width: "86px",
    height: "86px",
    borderRadius: "6px",
    background: "#202938",
    color: "#9ca3af",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
    textAlign: "center",
    padding: "8px",
  },
  content: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "5px",
  },
  eyebrow: {
    color: "#38bdf8",
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0",
  },
  title: {
    color: "#f8fafc",
    fontWeight: 700,
    fontSize: "15px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  meta: {
    color: "#cbd5e1",
    fontSize: "12px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  scoreRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
    marginTop: "2px",
  },
  score: {
    background: "#16a34a",
    color: "#fff",
    fontWeight: 800,
    fontSize: "12px",
    borderRadius: "999px",
    padding: "3px 8px",
  },
  detail: {
    color: "#94a3b8",
    fontSize: "11px",
  },
  actions: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    padding: "0 12px 12px",
  },
  link: {
    color: "#e5e7eb",
    border: "1px solid #334155",
    borderRadius: "6px",
    padding: "6px 9px",
    fontSize: "12px",
    fontWeight: 700,
    textDecoration: "none",
    background: "#0f172a",
  },
} satisfies Record<string, AppStyle>;

function parseMetadata(raw: string | null | undefined): MusicMetadata | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MusicMetadata;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function formatDuration(ms?: number): string | null {
  if (!ms) return null;
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatViews(count?: number): string | null {
  if (!count) return null;
  return `${count.toLocaleString()} YouTube views`;
}

export function getMusicMetadata(msg: Message): MusicMetadata | null {
  const metadata = parseMetadata(msg.metadata);
  if (metadata?.integration === "music-dashboard") return metadata;
  if (msg.source === "music-dashboard" && metadata) return metadata;
  return null;
}

export default function MusicMessagePreview({ msg }: { msg: Message }) {
  const metadata = getMusicMetadata(msg);
  if (!metadata) return null;

  const duration = formatDuration(metadata.durationMs);
  const views = formatViews(metadata.youtubeViewCount);
  const scoreDetails = metadata.scoringDetails
    ? [
        `Spotify ${metadata.scoringDetails.spotifyPopularity ?? 0}`,
        `YouTube ${metadata.scoringDetails.youtubeViewScore ?? 0}`,
        `Release ${metadata.scoringDetails.releaseRecencyBoost ?? 0}`,
        `Match ${metadata.scoringDetails.matchQualityScore ?? 0}`,
      ].join(" / ")
    : null;

  return (
    <article style={styles.card} aria-label="Music Dashboard share">
      <div style={styles.body}>
        {metadata.albumArt ? (
          <img src={metadata.albumArt} alt={metadata.album || metadata.title || "Album art"} style={styles.art} />
        ) : (
          <div style={styles.artFallback}>No artwork</div>
        )}
        <div style={styles.content}>
          <div style={styles.eyebrow}>Music Dashboard</div>
          <div style={styles.title}>{metadata.title || "Untitled track"}</div>
          <div style={styles.meta}>
            {[metadata.artist, metadata.album, metadata.releaseYear, duration].filter(Boolean).join(" • ")}
          </div>
          <div style={styles.scoreRow}>
            {typeof metadata.score === "number" && <span style={styles.score}>Score {metadata.score}/100</span>}
            {views && <span style={styles.detail}>{views}</span>}
            {metadata.youtubeUnavailable && <span style={styles.detail}>YouTube match unavailable</span>}
          </div>
          {scoreDetails && <div style={styles.detail}>{scoreDetails}</div>}
        </div>
      </div>
      <div style={styles.actions}>
        {metadata.spotifyUrl && (
          <a href={metadata.spotifyUrl} target="_blank" rel="noreferrer" style={styles.link}>
            Open Spotify
          </a>
        )}
        {metadata.youtubeUrl && (
          <a href={metadata.youtubeUrl} target="_blank" rel="noreferrer" style={styles.link}>
            Open YouTube
          </a>
        )}
      </div>
    </article>
  );
}
