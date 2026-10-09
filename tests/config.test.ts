import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, saveConfig, getConfigPath } from "../src/config.ts";

describe("TBuddy Config", () => {
  let testDir: string;
  const originalEnv = process.env.PI_AGENT_DIR;

  before(() => {
    testDir = mkdtempSync(join(tmpdir(), "pi-tbuddy-test-"));
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

  it("should return default config if config file does not exist", () => {
    const config = loadConfig();
    assert.equal(config.enabled, true);
    assert.equal(config.notifyOnSettled, true);
    assert.equal(config.notifyOnInput, true);
    assert.equal(config.botToken, undefined);
    assert.equal(config.targetChatId, undefined);
  });

  it("should save and load updated config", () => {
    saveConfig({
      botToken: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
      botUsername: "test_bot",
      targetChatId: 987654321,
      targetUser: "@tester",
    });

    assert.equal(existsSync(getConfigPath()), true);

    const reloaded = loadConfig();
    assert.equal(reloaded.botToken, "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11");
    assert.equal(reloaded.botUsername, "test_bot");
    assert.equal(reloaded.targetChatId, 987654321);
    assert.equal(reloaded.targetUser, "@tester");
    assert.equal(reloaded.enabled, true);
  });

  it("should allow partial updates", () => {
    saveConfig({ enabled: false });
    const config = loadConfig();
    assert.equal(config.enabled, false);
    assert.equal(config.botUsername, "test_bot");
  });
});
