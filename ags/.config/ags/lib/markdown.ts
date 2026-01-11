/**
 * Markdown parser utility for AGS chat system
 * Parses markdown content into structured blocks with support for:
 * - Bold (**text**), Italic (*text*), Code (`text`)
 * - Code blocks (``` language ```)
 * - Links ([text](url))
 * - Lists (- item, * item, 1. item)
 * - Block quotes (> quote)
 */

export type MarkdownBlockType = "text" | "code" | "list" | "quote" | "heading";

export interface MarkdownBlock {
  type: MarkdownBlockType;
  content: string;
  lang?: string;
  items?: string[];
  level?: number;
}

export interface MarkdownElement {
  type: "bold" | "italic" | "code" | "link" | "text";
  content: string;
  url?: string;
}

/**
 * Parse inline markdown elements (bold, italic, code, links)
 */
function parseInlineElements(text: string): MarkdownElement[] {
  const elements: MarkdownElement[] = [];
  let remaining = text;
  let lastIndex = 0;

  // Pattern to match markdown inline elements
  // Matches: **bold**, *italic*, `code`, [link](url)
  const inlinePattern =
    /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))/g;

  let match;
  let lastMatchEnd = 0;

  while ((match = inlinePattern.exec(text)) !== null) {
    // Add text before this match
    if (match.index > lastMatchEnd) {
      const textBefore = text.substring(lastMatchEnd, match.index);
      if (textBefore.trim()) {
        elements.push({
          type: "text",
          content: textBefore,
        });
      }
    }

    // Add the matched element
    if (match[2]) {
      // Bold
      elements.push({
        type: "bold",
        content: match[2],
      });
    } else if (match[4]) {
      // Italic
      elements.push({
        type: "italic",
        content: match[4],
      });
    } else if (match[6]) {
      // Code
      elements.push({
        type: "code",
        content: match[6],
      });
    } else if (match[8]) {
      // Link
      elements.push({
        type: "link",
        content: match[8],
        url: match[9],
      });
    }

    lastMatchEnd = inlinePattern.lastIndex;
  }

  // Add remaining text
  if (lastMatchEnd < text.length) {
    const remaining = text.substring(lastMatchEnd);
    if (remaining.trim()) {
      elements.push({
        type: "text",
        content: remaining,
      });
    }
  }

  return elements.length > 0
    ? elements
    : [
        {
          type: "text",
          content: text,
        },
      ];
}

/**
 * Parse a code block and extract language
 */
function parseCodeBlock(content: string): { lang: string; code: string } {
  const lines = content.split("\n");
  let lang = "";
  let code = content;

  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    // Check if first line contains a language specifier
    if (
      firstLine &&
      !firstLine.includes(" ") &&
      /^[a-zA-Z0-9_+-]*$/.test(firstLine)
    ) {
      lang = firstLine;
      code = lines.slice(1).join("\n");
    }
  }

  return { lang, code };
}

/**
 * Parse list items from a block
 */
function parseListBlock(content: string): {
  items: string[];
  type: "ul" | "ol";
} {
  const lines = content.split("\n").filter((line) => line.trim());
  const items: string[] = [];
  let type: "ul" | "ol" = "ul";

  for (const line of lines) {
    // Unordered list: - or *
    const ulMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (ulMatch) {
      items.push(ulMatch[1]);
      type = "ul";
      continue;
    }

    // Ordered list: 1. or 2.
    const olMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    if (olMatch) {
      items.push(olMatch[1]);
      type = "ol";
      continue;
    }
  }

  return { items, type };
}

/**
 * Parse quote block and extract content
 */
function parseQuoteBlock(content: string): string {
  return content
    .split("\n")
    .map((line) => line.replace(/^\s*>\s?/, ""))
    .join("\n")
    .trim();
}

/**
 * Check if a line is a code block delimiter
 */
function isCodeBlockDelimiter(line: string): boolean {
  return /^\s*```/.test(line);
}

/**
 * Check if a line is a quote
 */
function isQuoteLine(line: string): boolean {
  return /^\s*>/.test(line);
}

/**
 * Check if a line is a list item
 */
function isListLine(line: string): boolean {
  return /^\s*[-*]\s+.+$|^\s*\d+\.\s+.+$/.test(line);
}

/**
 * Check if a line is a heading
 */
function isHeading(line: string): boolean {
  return /^#{1,6}\s+.+$/.test(line);
}

/**
 * Parse heading and extract level
 */
function parseHeading(line: string): { level: number; content: string } {
  const match = line.match(/^(#{1,6})\s+(.+)$/);
  if (match) {
    return {
      level: match[1].length,
      content: match[2],
    };
  }
  return { level: 1, content: line };
}

/**
 * Main markdown parser
 * Converts markdown content into structured blocks
 */
export function parseMarkdown(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = content.split("\n");

  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Skip empty lines
    if (!trimmedLine) {
      i++;
      continue;
    }

    // Code block: ```
    if (isCodeBlockDelimiter(trimmedLine)) {
      const codeLines: string[] = [];
      let lang = "";
      i++; // Skip opening ```

      // Extract language from first line if present
      if (i < lines.length) {
        const firstLine = lines[i].trim();
        if (firstLine && !isCodeBlockDelimiter(firstLine)) {
          // Check if it looks like a language specifier
          if (/^[a-zA-Z0-9_+-]*$/.test(firstLine) && firstLine.length < 20) {
            lang = firstLine;
            i++;
          }
        }
      }

      // Collect code lines until closing ```
      while (i < lines.length) {
        if (isCodeBlockDelimiter(lines[i].trim())) {
          break;
        }
        codeLines.push(lines[i]);
        i++;
      }

      blocks.push({
        type: "code",
        content: codeLines.join("\n").trimEnd(),
        lang: lang || undefined,
      });

      i++; // Skip closing ```
      continue;
    }

    // Heading
    if (isHeading(trimmedLine)) {
      const { level, content: headingContent } = parseHeading(trimmedLine);
      const inlineElements = parseInlineElements(headingContent);
      blocks.push({
        type: "heading",
        content: inlineElements
          .map((el) =>
            el.type === "text" || el.type === "bold" || el.type === "italic"
              ? el.content
              : el.type === "code"
                ? `\`${el.content}\``
                : `[${el.content}](${el.url})`
          )
          .join(""),
        level,
      });
      i++;
      continue;
    }

    // Block quote
    if (isQuoteLine(trimmedLine)) {
      const quoteLines: string[] = [];
      while (i < lines.length && isQuoteLine(lines[i].trim())) {
        quoteLines.push(lines[i]);
        i++;
      }
      const quoteContent = parseQuoteBlock(quoteLines.join("\n"));
      blocks.push({
        type: "quote",
        content: quoteContent,
      });
      continue;
    }

    // List
    if (isListLine(trimmedLine)) {
      const listLines: string[] = [];
      while (i < lines.length && (isListLine(lines[i].trim()) || !lines[i].trim())) {
        if (lines[i].trim()) {
          listLines.push(lines[i]);
        }
        i++;
      }
      const { items } = parseListBlock(listLines.join("\n"));
      blocks.push({
        type: "list",
        content: items.join("\n"),
        items,
      });
      continue;
    }

    // Regular text block (paragraph)
    const textLines: string[] = [];
    while (
      i < lines.length &&
      !isCodeBlockDelimiter(lines[i].trim()) &&
      !isQuoteLine(lines[i].trim()) &&
      !isListLine(lines[i].trim()) &&
      !isHeading(lines[i].trim()) &&
      lines[i].trim()
    ) {
      textLines.push(lines[i]);
      i++;
    }

    if (textLines.length > 0) {
      const textContent = textLines.join("\n").trim();
      const inlineElements = parseInlineElements(textContent);
      blocks.push({
        type: "text",
        content: inlineElements
          .map((el) =>
            el.type === "text"
              ? el.content
              : el.type === "bold"
                ? `**${el.content}**`
                : el.type === "italic"
                  ? `*${el.content}*`
                  : el.type === "code"
                    ? `\`${el.content}\``
                    : `[${el.content}](${el.url})`
          )
          .join(""),
      });
    }
  }

  return blocks;
}

/**
 * Convert markdown blocks back to plain text (for display/export)
 */
export function blocksToText(blocks: MarkdownBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "heading":
          return `${"#".repeat(block.level || 1)} ${block.content}`;
        case "code":
          return (
            `\`\`\`${block.lang || ""}\n` +
            block.content +
            "\n```"
          );
        case "list":
          return (block.items || [])
            .map((item) => `- ${item}`)
            .join("\n");
        case "quote":
          return block.content
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n");
        case "text":
        default:
          return block.content;
      }
    })
    .join("\n\n");
}
