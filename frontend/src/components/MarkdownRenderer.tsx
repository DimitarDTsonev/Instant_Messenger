/**
 * Inline Markdown renderer — converts a message text string to styled React nodes.
 *
 * Supported syntax:
 *  - **bold**         → `<strong>`
 *  - *italic*         → `<em>`
 *  - ~~strikethrough~~ → `<del>`
 *  - `inline code`    → `<code>` (dark pill style)
 *  - ```code block``` → `<code>` (block style with horizontal scroll)
 *  - [text](url)      → `<a>` (opens in new tab)
 *  - bare https:// URL → `<a>` (opens in new tab)
 *  - @mention         → highlighted `<span>` if username is in the `users` array,
 *                       muted `<span>` otherwise
 *  - newlines         → `<br />`
 *
 * Rendering pipeline:
 *  1. Split on triple-backtick code blocks; collect parts typed as "codeblock" or "inline".
 *  2. Render "codeblock" parts as `<code style={codeBlockStyle}>`.
 *  3. Render "inline" parts by splitting on `\n` and calling `parseInline` on each line.
 *  4. `parseInline` is a recursive function that finds the first matching inline pattern,
 *     renders the wrapper node, then recurses on the before/after text segments.
 *
 * Used by: MessageRow.tsx (channel and DM message bodies).
 */

import { Fragment } from "react";
import type { ReactNode } from "react";
import type { User } from "../types";

type MentionUser = Pick<User, "username">;
/** A single inline pattern with its regex and React node factory. */
type InlinePattern = {
  re: RegExp;
  wrap: (match: RegExpMatchArray, key: number) => ReactNode;
};
/** One segment of the top-level parse result. */
type MarkdownPart = {
  type: "inline" | "codeblock";
  content: string;
  key: number;
};

/** Inline `code` pill style. */
const codeStyle = {
  background: "#0f0f1a",
  color: "#7289da",
  fontFamily: "monospace",
  padding: "1px 5px",
  borderRadius: "4px",
  fontSize: "13px",
} satisfies AppStyle;

/** Multi-line code block style. */
const codeBlockStyle = {
  background: "#0f0f1a",
  color: "#dbdee1",
  fontFamily: "monospace",
  fontSize: "13px",
  padding: "10px 14px",
  borderRadius: "6px",
  overflowX: "auto",
  whiteSpace: "pre",
  display: "block",
  margin: "4px 0",
  border: "1px solid #2d2d3f",
} satisfies AppStyle;

const linkStyle = {
  color: "#7289da",
  textDecoration: "underline",
} satisfies AppStyle;

/** Style applied to @mentions that resolve to a known user. */
const mentionStyle = {
  color: "#7289da",
  fontWeight: 600,
  background: "#5865f215",
  borderRadius: "3px",
  padding: "0 2px",
} satisfies AppStyle;

/**
 * Recursively parses an inline text string and returns React nodes for the first
 * matching pattern. Recurses on the text before and after each match so all
 * patterns are applied across the full string.
 *
 * Patterns are tested in order; earlier patterns take precedence over later ones.
 * (Named links are tested before bare URLs so `[text](url)` is not partially consumed.)
 *
 * @param text  - The raw text segment to parse.
 * @param users - Known members; used to decide if `@mention` should be highlighted.
 * @param key   - Base key for React reconciliation (offset into the string).
 * @returns     React node(s) representing the formatted text.
 */
function parseInline(text: string, users: MentionUser[], key = 0): ReactNode {
  if (!text) return null;

  const patterns: InlinePattern[] = [
    // **bold**
    { re: /\*\*(.+?)\*\*/s,  wrap: (m, k) => <strong key={k}>{parseInline(m[1] || "", users, k * 100)}</strong> },
    // *italic*
    { re: /\*(.+?)\*/s,      wrap: (m, k) => <em key={k}>{parseInline(m[1] || "", users, k * 100)}</em> },
    // ~~strikethrough~~
    { re: /~~(.+?)~~/s,      wrap: (m, k) => <del key={k}>{parseInline(m[1] || "", users, k * 100)}</del> },
    // `inline code`
    { re: /`([^`]+)`/,       wrap: (m, k) => <code key={k} style={codeStyle}>{m[1]}</code> },
    // [link text](url) — must come before bare URL to avoid partial consumption
    { re: /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/, wrap: (m, k) => (
      <a key={k} href={m[2]} target="_blank" rel="noopener noreferrer" style={linkStyle}>
        {m[1]}
      </a>
    )},
    // bare URL
    { re: /(https?:\/\/[^\s]+)/, wrap: (m, k) => (
      <a key={k} href={m[1]} target="_blank" rel="noopener noreferrer" style={linkStyle}>
        {m[1]}
      </a>
    )},
    // @mention — highlighted in blue if the username exists in `users`, muted otherwise
    { re: /@(\w+)/, wrap: (m, k) => {
      const mention = m[1] || "";
      const isKnown = users?.some((u) => u.username.toLowerCase() === mention.toLowerCase());
      return isKnown
        ? <span key={k} style={mentionStyle}>@{mention}</span>
        : <span key={k} style={{ color: "#949ba4" }}>@{mention}</span>;
    }},
  ];

  for (const { re, wrap } of patterns) {
    const match = text.match(re);
    if (!match || match.index === undefined) continue;

    const before = text.slice(0, match.index);
    const after  = text.slice(match.index + match[0].length);
    const k      = key + match.index;

    return (
      <Fragment key={k}>
        {before ? parseInline(before, users, k - 1) : null}
        {wrap(match, k)}
        {after  ? parseInline(after,  users, k + 1) : null}
      </Fragment>
    );
  }

  // No pattern matched — return the raw text string
  return text;
}

/**
 * Renders markdown-formatted `text` as React nodes.
 *
 * Returns `null` for empty or null inputs. Splits on triple-backtick code blocks
 * first, then applies inline formatting to everything else.
 *
 * @param text  - The message text to render. May be null/undefined.
 * @param users - Channel/DM member list; used to resolve @mention highlighting.
 */
export default function MarkdownRenderer({ text, users = [] }: { text?: string | null; users?: MentionUser[] }) {
  if (!text) return null;

  const parts: MarkdownPart[] = [];
  let idx = 0;

  const codeBlockRe = /```([\s\S]*?)```/g;
  let lastEnd = 0;
  let m: RegExpExecArray | null;

  // Extract triple-backtick code blocks; treat everything between them as inline markdown
  while ((m = codeBlockRe.exec(text)) !== null) {
    if (m.index > lastEnd) {
      parts.push({ type: "inline", content: text.slice(lastEnd, m.index), key: idx++ });
    }
    parts.push({ type: "codeblock", content: m[1].trim(), key: idx++ });
    lastEnd = m.index + m[0].length;
  }
  if (lastEnd < text.length) {
    parts.push({ type: "inline", content: text.slice(lastEnd), key: idx++ });
  }

  return (
    <span>
      {parts.map((part) => {
        if (part.type === "codeblock") {
          return <code key={part.key} style={codeBlockStyle}>{part.content}</code>;
        }

        // Split on newlines, rendering each line with inline markdown + <br /> separators
        const lines = part.content.split("\n");
        return (
          <span key={part.key}>
            {lines.map((line, li) => (
              <Fragment key={li}>
                {parseInline(line, users, li * 1000)}
                {li < lines.length - 1 && <br />}
              </Fragment>
            ))}
          </span>
        );
      })}
    </span>
  );
}
