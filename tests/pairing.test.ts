import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TBuddyBridge } from "../src/bridge.ts";
import { codeFromCommand, PairingCodes, CODE_TTL_MS } from "../src/pairing.ts";
import { getConfigPath, saveConfig } from "../src/config.ts";

describe("pairing codes", () => {
  it("accept the right code once, expire, and lock after 5 wrong tries", () => {
    let now = 0; const p = new PairingCodes(() => now);
    assert.deepEqual(p.check("ANY"), { ok: false, reason: "none" });
    const { code } = p.issue(); assert.match(code, /^[A-Z2-9]{6}$/);
    assert.deepEqual(p.check(code.toLowerCase().slice(0, 3) + "-" + code.slice(3).toLowerCase()), { ok: true }, "case and dash insensitive");
    assert.deepEqual(p.check(code), { ok: false, reason: "none" }, "single use");
    const second = p.issue().code; now += CODE_TTL_MS;
    assert.deepEqual(p.check(second), { ok: false, reason: "expired" });
    p.issue();
    for (let i = 0; i < 4; i++) assert.deepEqual(p.check("WRONG1"), { ok: false, reason: "wrong" });
    assert.deepEqual(p.check("WRONG1"), { ok: false, reason: "locked" });
  });
  it("read the code from /pair, /pair@bot and deep-link /start", () => {
    assert.equal(codeFromCommand("/pair ABC234"), "ABC234");
    assert.equal(codeFromCommand("/pair@MyBot  ABC234"), "ABC234");
    assert.equal(codeFromCommand("/start ABC234"), "ABC234");
    assert.equal(codeFromCommand("/start"), undefined);
  });
});

describe("bridge pairing", () => {
  let dir: string; const prev = process.env.PI_AGENT_DIR;
  before(() => { dir = mkdtempSync(join(tmpdir(), "tbuddy-pair-")); process.env.PI_AGENT_DIR = dir; });
  after(() => { if (prev === undefined) delete process.env.PI_AGENT_DIR; else process.env.PI_AGENT_DIR = prev; rmSync(dir, { recursive: true, force: true }); });

  function setup() {
    saveConfig({ botToken: undefined, botUsername: "MyBot", targetChatId: 111, targetUser: "@owner" });
    const sent: Array<[number | string, string]> = []; const notes: string[] = [];
    const bridge: any = new TBuddyBridge({ sendUserMessage() {} } as any);
    bridge.client = { sendMessage: async (id: number | string, text: string) => { sent.push([id, text]); return {}; } };
    bridge.setContext({ ui: { notify: (m: string) => notes.push(m) } } as any);
    const pair = (chatId: number, text: string) => bridge.handlePairRequest({ id: chatId, is_bot: false, first_name: "X", username: `u${chatId}` }, { id: chatId, type: "private" }, text);
    return { bridge, sent, notes, pair };
  }

  it("a stranger's /start never takes over the paired chat", async () => {
    const { bridge, sent, pair } = setup();
    await pair(999, "/start");
    assert.equal(bridge.getConfig().targetChatId, 111);
    assert.match(sent[0][1], /Pairing is not open/);
    bridge.startPairing();
    await pair(999, "/pair WRONG2");
    assert.equal(bridge.getConfig().targetChatId, 111, "wrong code while pairing is open");
  });

  it("only the chat that sends the current code pairs, and the owner is told about failures", async () => {
    const { bridge, sent, notes, pair } = setup();
    const { code, link } = bridge.startPairing();
    assert.equal(link, `https://t.me/MyBot?start=${code}`);
    await pair(222, "/pair NOPE22");
    assert.match(notes.join("\n"), /rejected \(wrong\).*222/);
    await pair(222, `/start ${code}`);
    assert.equal(bridge.getConfig().targetChatId, 222); assert.equal(bridge.getConfig().targetUser, "@u222");
    await pair(333, `/pair ${code}`);
    assert.equal(bridge.getConfig().targetChatId, 222, "code cannot be reused");
    await pair(222, "/start"); assert.match(sent.at(-1)![1], /already paired/);
  });

  it("the config file holding the bot token is owner-only", { skip: process.platform === "win32" }, () => {
    saveConfig({ botToken: "123:abc" });
    assert.equal(statSync(getConfigPath()).mode & 0o777, 0o600);
  });
});
