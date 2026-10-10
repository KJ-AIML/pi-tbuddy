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

describe("TelegramPoller", () => {
  it("a restart never leaves two polling loops running", async () => {
    const { TelegramPoller } = await import("../src/telegram.ts");
    let active = 0, peak = 0, calls = 0; const waiters: Array<() => void> = [];
    const client: any = {
      async getUpdates(_o: number, _t: number, signal: AbortSignal) {
        active++; calls++; peak = Math.max(peak, active);
        // Ignores abort on purpose, like a slow network response that still completes.
        await new Promise<void>(r => waiters.push(r)); active--;
        void signal; return [];
      },
      async sendMessage() { return {}; },
    };
    const poller = new TelegramPoller(client, () => undefined, () => {}, () => {});
    poller.start(); poller.stop(); poller.start();
    await new Promise(r => setTimeout(r, 10));
    for (let i = 0; i < 6; i++) { waiters.shift()?.(); await new Promise(r => setTimeout(r, 5)); }
    poller.stop(); while (waiters.length) waiters.shift()!();
    await new Promise(r => setTimeout(r, 10));
    assert.ok(calls <= 7, `only one loop keeps polling: ${calls} requests`);
    assert.equal(active, 0);
  });

  it("forwards /start and /pair with their text to the pair handler; others from strangers are refused", async () => {
    const { TelegramPoller } = await import("../src/telegram.ts");
    const updates = [
      { update_id: 1, message: { message_id: 1, chat: { id: 5, type: "private" }, date: 0, text: "/pair ABC234" } },
      { update_id: 2, message: { message_id: 2, chat: { id: 5, type: "private" }, date: 0, text: "rm -rf please" } },
      { update_id: 3, message: { message_id: 3, chat: { id: 5, type: "private" }, date: 0, text: "/startle" } },
    ];
    const pairs: string[] = []; const forwarded: string[] = []; const refusals: string[] = [];
    let served = false; let poller: any;
    const client: any = {
      async getUpdates() { if (served) { poller.stop(); return []; } served = true; return updates; },
      async sendMessage(_id: number, text: string) { refusals.push(text); return {}; },
    };
    poller = new TelegramPoller(client, () => 111, m => { forwarded.push(m.text!); }, (_u, _c, text) => { pairs.push(text); });
    poller.start(); await new Promise(r => setTimeout(r, 20));
    assert.deepEqual(pairs, ["/pair ABC234"]); assert.deepEqual(forwarded, []);
    assert.equal(refusals.length, 2); assert.match(refusals[0], /not paired/); assert.doesNotMatch(refusals[0], /tbuddy target/);
  });
});
