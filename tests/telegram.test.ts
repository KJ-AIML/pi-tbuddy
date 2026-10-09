import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TelegramClient } from "../src/telegram.ts";

describe("TelegramClient", () => {
  it("should initialize with token and construct base URL", () => {
    const client = new TelegramClient("dummy_token");
    assert.ok(client);
  });

  it("should truncate long messages safely", async () => {
    // Intercept fetch to verify truncated body length
    let requestedBody: any = null;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/sendMessage")) {
        requestedBody = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ ok: true, result: { message_id: 1, chat: { id: 123 }, text: requestedBody.text } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(url, init);
    }) as typeof globalThis.fetch;

    try {
      const client = new TelegramClient("fake_token");
      const longMessage = "a".repeat(5000);
      await client.sendMessage(123, longMessage);

      assert.ok(requestedBody);
      assert.ok(requestedBody.text.length <= 4000);
      assert.ok(requestedBody.text.endsWith("...[truncated]"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should fallback to plain text if markdown parse fails", async () => {
    let callCount = 0;
    let lastParseMode: string | undefined = undefined;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/sendMessage")) {
        callCount++;
        const body = JSON.parse(init?.body as string);
        lastParseMode = body.parse_mode;
        if (body.parse_mode === "Markdown") {
          return new Response(
            JSON.stringify({
              ok: false,
              description: "Bad Request: can't parse entities in message text",
              error_code: 400,
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(JSON.stringify({ ok: true, result: { message_id: 2, chat: { id: 123 }, text: body.text } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(url, init);
    }) as typeof globalThis.fetch;

    try {
      const client = new TelegramClient("fake_token");
      await client.sendMessage(123, "Text with broken *markdown", { parse_mode: "Markdown" });

      assert.equal(callCount, 2);
      assert.equal(lastParseMode, undefined);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
