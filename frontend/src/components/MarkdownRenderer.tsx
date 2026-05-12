/**
 * @fileoverview MarkdownRenderer — Inline markdown-to-React renderer
 *
 * Converts a plain text message string into styled React elements, supporting a
 * subset of Markdown and chat-specific syntax:
 *
 *   - **bold**           → <strong>
 *   - *italic*           → <em>
 *   - ~~strikethrough~~  → <del>
 *   - `inline code`      → <code> (dark background)
 *   - ```code block```   → block <code> (pre-formatted, horizontally scrollable)
 *   - [text](url)        → <a target="_blank">
 *   - bare URL           → <a target="_blank">
 *   - @mention           → highlighted span (indigo if the username is a known channel member)
 *   - Newlines           → <br />
 *
 * Parsing is done in two passes:
 *   1. A regex split extracts fenced code blocks (``` … ```) before any inline parsing,
 *      so code block contents are never processed for inline markdown.
 *   2. The remaining inline segments are recursively parsed by `parseInline` which
 *      scans for the first matching pattern and then recurses on the remaining text.
 *
 * @module components/MarkdownRenderer
 */

import { Fragment } from "react";
import type { ReactNode } from "react";
import type { User } from "../types";

type MentionUser = Pick<User, "username">;
type InlinePattern = {
  re: RegExp;
  wrap: (match: RegExpMatchArray, key: number) => ReactNode;
};
type MarkdownPart = {
  type: "inline" | "codeblock";
  content: string;
  key: number;
};

/**
 * Style for inline `code` spans.
 * @type {React.CSSProperties}
 */
const codeStyle = {
  background: "#0f0f1a",
  color: "#7289da",
  fontFamily: "monospace",
  padding: "1px 5px",
  borderRadius: "4px",
  fontSize: "13px",
} satisfies AppStyle;

/**
 * Style for fenced ``` code blocks ```.
 * Rendered as a full-width block with horizontal scroll for long lines.
 * @type {React.CSSProperties}
 */
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

/**
 * Style for markdown link anchors.
 * @type {React.CSSProperties}
 */
const linkStyle = {
  color: "#7289da",
  textDecoration: "underline",
} satisfies AppStyle;

/**
 * Style for @mention spans whose username matches a known channel member.
 * Unknown mentions fall back to muted grey.
 * @type {React.CSSProperties}
 */
const mentionStyle = {
  color: "#7289da",
  fontWeight: 600,
  background: "#5865f215",
  borderRadius: "3px",
  padding: "0 2px",
} satisfies AppStyle;

/**
 * Recursively parses inline markdown within a single line of text.
 *
 * Scans `text` against each pattern in priority order (bold before italic so
 * `**text**` is not consumed as two `*italic*` tokens). On the first match, it
 * splits the string into:
 *   - `before` — text preceding the match (recursed)
 *   - the match itself — wrapped by the pattern's `wrap` function
 *   - `after`  — text following the match (recursed)
 *
 * If no pattern matches, the raw string is returned (base case).
 *
 * @param {string}        text  - Remaining text to parse
 * @param {Array<Object>} users - Channel member list; used to distinguish known @mentions
 * @param {number}        [key=0] - Base key offset for stable React element keys
 * @returns {JSX.Element|string|null} Parsed React tree, plain string, or null for empty input
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
    // [link text](url)
    { re: /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/, wrap: (m, k) => (
      <a key={k} href={m[2]} target="_blank" rel="noopener noreferrer" style={linkStyle}>
        {m[1]}
      </a>
    )},
    // bare URL — must come after the named-link pattern
    { re: /(https?:\/\/[^\s]+)/, wrap: (m, k) => (
      <a key={k} href={m[1]} target="_blank" rel="noopener noreferrer" style={linkStyle}>
        {m[1]}
      </a>
    )},
    // @mention — highlighted if username is in the known members list
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

  // No pattern matched — return the raw string
  return text;
}

/**
 * MarkdownRenderer component — renders a message string as styled React elements.
 *
 * Splits `text` on fenced code blocks first so their contents bypass inline parsing.
 * Each remaining inline segment is line-split on `\n` and rendered with `<br />`
 * separators to preserve line breaks. Code blocks are rendered as styled `<code>` blocks.
 *
 * @component
 * @param {Object}        props
 * @param {string}        props.text        - Raw message text to render
 * @param {Array<Object>} [props.users=[]]  - Channel member list for @mention resolution;
 *   each object must have a `username` string property
 * @returns {JSX.Element|null} Rendered message content, or null for empty input
 *
 * @example
 * <MarkdownRenderer text={message.content} users={channelMembers} />
 */
export default function MarkdownRenderer({ text, users = [] }: { text?: string | null; users?: MentionUser[] }) {
  if (!text) return null;

  /**
   * Segments produced by splitting `text` on fenced code blocks.
   * Each segment is `{ type: "inline"|"codeblock", content: string, key: number }`.
   * @type {Array<{ type: string, content: string, key: number }>}
   */
  const parts: MarkdownPart[] = [];
  let idx = 0;

  const codeBlockRe = /```([\s\S]*?)```/g;
  let lastEnd = 0;
  let m: RegExpExecArray | null;

  // Extract code blocks; everything between them is treated as inline markdown
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

        // Split on newlines and insert <br /> between lines
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