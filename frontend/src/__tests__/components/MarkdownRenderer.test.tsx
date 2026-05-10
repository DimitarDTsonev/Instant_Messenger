/**
 * @fileoverview Tests for MarkdownRenderer component
 * Covers: bold, italic, strikethrough, inline code, code blocks, links, mentions, newlines
 */

import { render, screen } from "@testing-library/react";
import MarkdownRenderer from "../../components/MarkdownRenderer";

describe("MarkdownRenderer", () => {
  test("renders null for empty input", () => {
    const { container } = render(<MarkdownRenderer text="" />);
    expect(container.firstChild).toBeNull();
  });

  test("renders null for undefined input", () => {
    const { container } = render(<MarkdownRenderer text={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  test("renders plain text without transformation", () => {
    render(<MarkdownRenderer text="hello world" />);
    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  test("renders **bold** as <strong>", () => {
    const { container } = render(<MarkdownRenderer text="**bold text**" />);
    expect(container.querySelector("strong")).toBeInTheDocument();
    expect(container.querySelector("strong").textContent).toBe("bold text");
  });

  test("renders *italic* as <em>", () => {
    const { container } = render(<MarkdownRenderer text="*italic text*" />);
    expect(container.querySelector("em")).toBeInTheDocument();
    expect(container.querySelector("em").textContent).toBe("italic text");
  });

  test("renders ~~strikethrough~~ as <del>", () => {
    const { container } = render(<MarkdownRenderer text="~~strike~~" />);
    expect(container.querySelector("del")).toBeInTheDocument();
    expect(container.querySelector("del").textContent).toBe("strike");
  });

  test("renders `inline code` as <code>", () => {
    const { container } = render(<MarkdownRenderer text="`const x = 1`" />);
    expect(container.querySelector("code")).toBeInTheDocument();
    expect(container.querySelector("code").textContent).toBe("const x = 1");
  });

  test("renders fenced ``` code blocks ``` as block <code>", () => {
    const { container } = render(<MarkdownRenderer text={"```\nconst x = 1;\n```"} />);
    expect(container.querySelector("code")).toBeInTheDocument();
    expect(container.querySelector("code").textContent).toContain("const x = 1;");
  });

  test("renders [link text](url) as <a>", () => {
    const { container } = render(<MarkdownRenderer text="[click me](https://example.com)" />);
    const a = container.querySelector("a");
    expect(a).toBeInTheDocument();
    expect(a.href).toBe("https://example.com/");
    expect(a.textContent).toBe("click me");
    expect(a.target).toBe("_blank");
    expect(a.rel).toContain("noopener");
  });

  test("renders bare URLs as clickable links", () => {
    const { container } = render(<MarkdownRenderer text="visit https://example.com today" />);
    expect(container.querySelector("a")).toBeInTheDocument();
    expect(container.querySelector("a").href).toBe("https://example.com/");
  });

  test("renders @mention in highlight style for known user", () => {
    const users = [{ username: "alice" }];
    const { container } = render(<MarkdownRenderer text="hello @alice" users={users} />);
    // The outer <span> wraps the whole line; find the inner mention span
    const spans = Array.from(container.querySelectorAll("span"));
    const mention = spans.find((s) => s.textContent === "@alice");
    expect(mention).toBeDefined();
    // Known user gets the blue mention style (fontWeight: 600)
    expect(mention.style.fontWeight).toBe("600");
  });

  test("renders @mention in muted style for unknown user", () => {
    const { container } = render(<MarkdownRenderer text="hello @unknown" users={[]} />);
    const spans = Array.from(container.querySelectorAll("span"));
    const span = spans.find((s) => s.textContent === "@unknown");
    expect(span).toBeDefined();
    expect(span.style.color).toBe("rgb(148, 155, 164)");
  });

  test("converts \\n newlines to <br>", () => {
    const { container } = render(<MarkdownRenderer text={"line1\nline2"} />);
    expect(container.querySelector("br")).toBeInTheDocument();
  });

  test("code block content is not processed for inline markdown", () => {
    const { container } = render(<MarkdownRenderer text={"```\n**not bold**\n```"} />);
    expect(container.querySelector("strong")).toBeNull();
    expect(container.querySelector("code").textContent).toContain("**not bold**");
  });

  test("renders mixed content correctly", () => {
    const { container } = render(
      <MarkdownRenderer text="**Hello** *world* and `code`" />
    );
    expect(container.querySelector("strong").textContent).toBe("Hello");
    expect(container.querySelector("em").textContent).toBe("world");
    expect(container.querySelector("code").textContent).toBe("code");
  });
});
