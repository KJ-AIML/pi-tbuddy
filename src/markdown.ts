/**
 * Convert standard Markdown (CommonMark / GitHub Flavored Markdown)
 * into Telegram-compatible HTML.
 *
 * Supported Telegram HTML tags:
 * - <b>bold</b>, <strong>bold</strong>
 * - <i>italic</i>, <em>italic</em>
 * - <u>underline</u>, <ins>underline</ins>
 * - <s>strikethrough</s>, <strike>, <del>
 * - <code>inline code</code>
 * - <pre>code block</pre>
 * - <blockquote>quote</blockquote>
 * - <a href="...">link</a>
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function markdownToTelegramHtml(markdown: string): string {
  if (!markdown) return "";

  const codeBlocks: string[] = [];
  const inlineCodes: string[] = [];

  // 1. Extract fenced code blocks
  let text = markdown.replace(/```(?:([a-zA-Z0-9_+-]+)?\n)?([\s\S]*?)```/g, (_match, _lang, code) => {
    const escaped = escapeHtml((code ?? "").replace(/\n$/, ""));
    const placeholder = `\x00CODEBLOCK_${codeBlocks.length}\x00`;
    codeBlocks.push(`<pre><code>${escaped}</code></pre>`);
    return placeholder;
  });

  // 2. Extract inline code
  text = text.replace(/`([^`\n]+)`/g, (_match, code) => {
    const escaped = escapeHtml(code);
    const placeholder = `\x00INLINECODE_${inlineCodes.length}\x00`;
    inlineCodes.push(`<code>${escaped}</code>`);
    return placeholder;
  });

  // 3. Escape HTML characters in remaining text
  text = escapeHtml(text);

  // 4. Headings (# Title, ## Subtitle, ### Section) -> <b>Title</b>
  text = text.replace(/^(?:&gt;\s*)?#{1,6}\s+(.+)$/gm, "<b>$1</b>");

  // 5. Blockquotes (> text)
  text = text.replace(/^&gt;\s*(.+)$/gm, "<blockquote>$1</blockquote>");

  // 6. Horizontal rules (--- or ***)
  text = text.replace(/^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm, "————————————");

  // 7. Bullet lists (* item, - item, + item)
  text = text.replace(/^[ \t]*[*\-+][ \t]+(.*)$/gm, "• $1");

  // 8. Numbered lists (1. item) -> keep or format
  text = text.replace(/^[ \t]*(\d+)\.[ \t]+(.*)$/gm, "$1. $2");

  // 9. Bold + Italic (***bolditalic*** or ___bolditalic___)
  text = text.replace(/\*\*\*([^*]+?)\*\*\*/g, "<b><i>$1</i></b>");
  text = text.replace(/___([^_]+?)___/g, "<b><i>$1</i></b>");

  // 10. Bold (**bold** or __bold__)
  text = text.replace(/\*\*([^*]+?)\*\*/g, "<b>$1</b>");
  text = text.replace(/__([^_]+?)__/g, "<b>$1</b>");

  // 11. Italic (*italic* or _italic_)
  // Avoid matching inside words like variable_name
  text = text.replace(/(^|[\s(])\*([^*\n]+?)\*($|[\s),.!?])/g, "$1<i>$2</i>$3");
  text = text.replace(/(^|[\s(])_([^_\n]+?)_($|[\s),.!?])/g, "$1<i>$2</i>$3");

  // 12. Strikethrough (~~strike~~)
  text = text.replace(/~~([^~]+?)~~/g, "<s>$1</s>");

  // 13. Links ([text](url))
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');

  // 14. Restore inline code
  text = text.replace(/\x00INLINECODE_(\d+)\x00/g, (_match, index) => {
    return inlineCodes[Number(index)] || "";
  });

  // 15. Restore code blocks
  text = text.replace(/\x00CODEBLOCK_(\d+)\x00/g, (_match, index) => {
    return codeBlocks[Number(index)] || "";
  });

  // 16. Ensure tags are balanced
  return ensureBalancedTags(text);
}

/**
 * Ensures all opened HTML tags are properly closed so Telegram doesn't reject the message.
 */
export function ensureBalancedTags(html: string): string {
  const tagStack: string[] = [];
  const tagRegex = /<\/?([a-zA-Z0-9]+)[^>]*>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(html)) !== null) {
    const fullTag = match[0];
    const tagName = match[1].toLowerCase();

    // Self-closing tags (if any)
    if (fullTag.endsWith("/>") || tagName === "br" || tagName === "hr") {
      continue;
    }

    if (fullTag.startsWith("</")) {
      // Closing tag
      if (tagStack.length > 0 && tagStack[tagStack.length - 1] === tagName) {
        tagStack.pop();
      }
    } else {
      // Opening tag
      tagStack.push(tagName);
    }
  }

  // Close any unclosed tags in reverse order
  let result = html;
  while (tagStack.length > 0) {
    const unclosed = tagStack.pop()!;
    result += `</${unclosed}>`;
  }

  return result;
}
