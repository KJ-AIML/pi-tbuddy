import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface TBuddyConfig {
  botToken?: string;
  botUsername?: string;
  targetChatId?: number | string;
  targetUser?: string;
  enabled: boolean;
  notifyOnSettled: boolean;
  notifyOnInput: boolean;
}

const DEFAULT_CONFIG: TBuddyConfig = {
  enabled: true,
  notifyOnSettled: true,
  notifyOnInput: true,
};

export function getConfigPath(): string {
  const agentDir = process.env.PI_AGENT_DIR || join(homedir(), ".pi", "agent");
  return join(agentDir, "tbuddy.json");
}

export function loadConfig(): TBuddyConfig {
  const configPath = getConfigPath();
  try {
    if (!existsSync(configPath)) {
      return { ...DEFAULT_CONFIG };
    }
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
    };
  } catch (err) {
    console.error(`[tbuddy] Failed to read config from ${configPath}:`, err);
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(updates: Partial<TBuddyConfig>): TBuddyConfig {
  const current = loadConfig();
  const next: TBuddyConfig = {
    ...current,
    ...updates,
  };
  const configPath = getConfigPath();
  try {
    mkdirSync(dirname(configPath), { recursive: true });
    // The file holds the bot token: readable by the owner only.
    writeFileSync(configPath, JSON.stringify(next, null, 2), { encoding: "utf-8", mode: 0o600 });
    try { chmodSync(configPath, 0o600); } catch {}
  } catch (err) {
    console.error(`[tbuddy] Failed to save config to ${configPath}:`, err);
  }
  return next;
}
