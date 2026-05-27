import { render, screen } from "@testing-library/react";
import MusicMessagePreview, { getMusicMetadata } from "../../components/MusicMessagePreview";
import type { Message } from "../../types";

function makeMsg(overrides: Partial<Message> = {}): Message {
  return {
    id: 1,
    content: "",
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function musicMetadata(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    integration: "music-dashboard",
    title: "Bohemian Rhapsody",
    artist: "Queen",
    album: "A Night at the Opera",
    releaseYear: "1975",
    ...extra,
  });
}

describe("getMusicMetadata", () => {
  test("returns metadata when integration is music-dashboard", () => {
    const msg = makeMsg({ metadata: musicMetadata() });
    const result = getMusicMetadata(msg);
    expect(result?.title).toBe("Bohemian Rhapsody");
  });

  test("returns metadata when source is music-dashboard (no integration field)", () => {
    const msg = makeMsg({
      source: "music-dashboard",
      metadata: JSON.stringify({ title: "Track", artist: "Artist" }),
    });
    expect(getMusicMetadata(msg)?.title).toBe("Track");
  });

  test("returns null when metadata is missing", () => {
    expect(getMusicMetadata(makeMsg())).toBeNull();
  });

  test("returns null when metadata is invalid JSON", () => {
    const msg = makeMsg({ metadata: "not-json" });
    expect(getMusicMetadata(msg)).toBeNull();
  });

  test("returns null when metadata is not an object", () => {
    const msg = makeMsg({ metadata: "42" });
    expect(getMusicMetadata(msg)).toBeNull();
  });

  test("returns null when integration is not music-dashboard and source is different", () => {
    const msg = makeMsg({
      source: "other-source",
      metadata: JSON.stringify({ integration: "other", title: "Track" }),
    });
    expect(getMusicMetadata(msg)).toBeNull();
  });
});

describe("MusicMessagePreview", () => {
  test("returns null (renders nothing) when no music metadata", () => {
    const { container } = render(<MusicMessagePreview msg={makeMsg()} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("renders card with title and artist", () => {
    const msg = makeMsg({ metadata: musicMetadata() });
    render(<MusicMessagePreview msg={msg} />);
    expect(screen.getByText("Bohemian Rhapsody")).toBeInTheDocument();
    expect(screen.getByText(/Queen/)).toBeInTheDocument();
  });

  test("renders album art image when albumArt URL is provided", () => {
    const msg = makeMsg({ metadata: musicMetadata({ albumArt: "https://example.com/art.jpg" }) });
    render(<MusicMessagePreview msg={msg} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://example.com/art.jpg");
  });

  test("renders 'No artwork' fallback when albumArt is missing", () => {
    const msg = makeMsg({ metadata: musicMetadata() });
    render(<MusicMessagePreview msg={msg} />);
    expect(screen.getByText("No artwork")).toBeInTheDocument();
  });

  test("renders score badge when score is provided", () => {
    const msg = makeMsg({ metadata: musicMetadata({ score: 88 }) });
    render(<MusicMessagePreview msg={msg} />);
    expect(screen.getByText("Score 88/100")).toBeInTheDocument();
  });

  test("does not render score badge when score is absent", () => {
    const msg = makeMsg({ metadata: musicMetadata() });
    render(<MusicMessagePreview msg={msg} />);
    expect(screen.queryByText(/Score/)).not.toBeInTheDocument();
  });

  test("renders YouTube view count when provided", () => {
    const msg = makeMsg({ metadata: musicMetadata({ youtubeViewCount: 1234567 }) });
    render(<MusicMessagePreview msg={msg} />);
    expect(screen.getByText(/1,234,567 YouTube views/)).toBeInTheDocument();
  });

  test("renders 'YouTube match unavailable' when youtubeUnavailable is true", () => {
    const msg = makeMsg({ metadata: musicMetadata({ youtubeUnavailable: true }) });
    render(<MusicMessagePreview msg={msg} />);
    expect(screen.getByText("YouTube match unavailable")).toBeInTheDocument();
  });

  test("renders duration in m:ss format", () => {
    const msg = makeMsg({ metadata: musicMetadata({ durationMs: 354000 }) }); // 5:54
    render(<MusicMessagePreview msg={msg} />);
    expect(screen.getByText(/5:54/)).toBeInTheDocument();
  });

  test("renders scoring details when scoringDetails is provided", () => {
    const msg = makeMsg({
      metadata: musicMetadata({
        scoringDetails: {
          spotifyPopularity: 85,
          youtubeViewScore: 70,
          releaseRecencyBoost: 10,
          matchQualityScore: 95,
        },
      }),
    });
    render(<MusicMessagePreview msg={msg} />);
    expect(screen.getByText(/Spotify 85/)).toBeInTheDocument();
  });

  test("renders Spotify link when spotifyUrl is provided", () => {
    const msg = makeMsg({ metadata: musicMetadata({ spotifyUrl: "https://open.spotify.com/track/123" }) });
    render(<MusicMessagePreview msg={msg} />);
    const link = screen.getByRole("link", { name: /open spotify/i });
    expect(link).toHaveAttribute("href", "https://open.spotify.com/track/123");
  });

  test("renders YouTube link when youtubeUrl is provided", () => {
    const msg = makeMsg({ metadata: musicMetadata({ youtubeUrl: "https://youtube.com/watch?v=abc" }) });
    render(<MusicMessagePreview msg={msg} />);
    const link = screen.getByRole("link", { name: /open youtube/i });
    expect(link).toHaveAttribute("href", "https://youtube.com/watch?v=abc");
  });

  test("renders 'Untitled track' when title is missing", () => {
    const msg = makeMsg({
      metadata: JSON.stringify({ integration: "music-dashboard" }),
    });
    render(<MusicMessagePreview msg={msg} />);
    expect(screen.getByText("Untitled track")).toBeInTheDocument();
  });

  test("renders aria-label on card", () => {
    const msg = makeMsg({ metadata: musicMetadata() });
    render(<MusicMessagePreview msg={msg} />);
    expect(screen.getByRole("article", { name: /music dashboard share/i })).toBeInTheDocument();
  });
});
