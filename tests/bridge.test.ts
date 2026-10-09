import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TBuddyBridge } from "../src/bridge.ts";

describe("TBuddyBridge", () => {
  let testDir: string;
  const originalEnv = process.env.PI_AGENT_DIR;

  before(() => {
    testDir = mkdtempSync(join(tmpdir(), "pi-tbuddy-bridge-test-"));
    process.env.PI_AGENT_DIR = testDir;
  });

  after(() => {
    if (originalEnv !== undefined) {
      process.env.PI_AGENT_DIR = originalEnv;
    } else {
      delete process.env.PI_AGENT_DIR;
    }
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should initialize with default config", () => {
    const mockPi: any = {
      sendUserMessage: () => {},
    };
    const bridge = new TBuddyBridge(mockPi);
    assert.equal(bridge.getConfig().enabled, true);
    assert.equal(bridge.getConfig().botToken, undefined);
  });

  it("should toggle enabled state", () => {
    const mockPi: any = {
      sendUserMessage: () => {},
    };
    const bridge = new TBuddyBridge(mockPi);
    const state1 = bridge.toggleEnabled();
    assert.equal(state1, false);
    assert.equal(bridge.getConfig().enabled, false);

    const state2 = bridge.toggleEnabled();
    assert.equal(state2, true);
    assert.equal(bridge.getConfig().enabled, true);
  });

  it("should clear credentials and pairing", () => {
    const mockPi: any = {
      sendUserMessage: () => {},
    };
    const bridge = new TBuddyBridge(mockPi);
    bridge.clear();
    const cfg = bridge.getConfig();
    assert.equal(cfg.botToken, undefined);
    assert.equal(cfg.targetChatId, undefined);
  });
});
