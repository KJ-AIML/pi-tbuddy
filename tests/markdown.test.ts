import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { markdownToTelegramHtml, ensureBalancedTags } from "../src/markdown.ts";

describe("markdownToTelegramHtml", () => {
  it("converts headings to <b> tags", () => {
    const md = "### 1. Named Tasks (`heli task`)";
    const html = markdownToTelegramHtml(md);
    assert.equal(html, "<b>1. Named Tasks (<code>heli task</code>)</b>");
  });

  it("converts bold and bullet points correctly", () => {
    const md = "* **Active Tasks:** **None** (`tasks: []`)";
    const html = markdownToTelegramHtml(md);
    assert.ok(html.includes("• <b>Active Tasks:</b> <b>None</b> (<code>tasks: []</code>)"));
  });

  it("converts the user's screenshot markdown sample accurately", () => {
    const md = `Here is the report on the last active state and tasks in Heli:

---

### 1. Named Tasks (\`heli task\`)
* **Active Tasks:** **None** (\`tasks: []\`, 0 active tasks recorded in the concurrent workspace).

---

### 2. Last Active Continuation (\`heli resume\`)
While no formal named task was created, Heli recorded a **durable continuation** from the previous session:

* **Continuation ID:** \`continuation-76b014d19bb77fc6031a0271\`
* **Host / Previous Session:** \`pi\``;

    const html = markdownToTelegramHtml(md);

    // Verify no unclosed tags
    assert.ok(html.includes("<b>1. Named Tasks (<code>heli task</code>)</b>"));
    assert.ok(html.includes("<b>Active Tasks:</b>"));
    assert.ok(html.includes("<code>continuation-76b014d19bb77fc6031a0271</code>"));
    assert.ok(html.includes("<b>durable continuation</b>"));
    assert.ok(html.includes("• <b>Continuation ID:</b>"));
  });

  it("escapes raw HTML tags inside text and code", () => {
    const md = "Here is `<div class=\"test\">` & text with <script>alert(1)</script>";
    const html = markdownToTelegramHtml(md);
    assert.ok(html.includes("<code>&lt;div class=\"test\"&gt;</code>"));
    assert.ok(html.includes("&amp; text with &lt;script&gt;alert(1)&lt;/script&gt;"));
  });

  it("converts fenced code blocks with language", () => {
    const md = "```ts\nconst x: number = 42;\n```";
    const html = markdownToTelegramHtml(md);
    assert.equal(html, "<pre><code>const x: number = 42;</code></pre>");
  });

  it("auto-closes open tags if HTML is truncated", () => {
    const unclosed = "<b><i>Some text";
    const closed = ensureBalancedTags(unclosed);
    assert.equal(closed, "<b><i>Some text</i></b>");
  });
});
