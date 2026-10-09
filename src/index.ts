import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { TBuddyBridge } from "./bridge.ts";

export default function (pi: ExtensionAPI) {
  const bridge = new TBuddyBridge(pi);

  // Lifecycle listeners
  pi.on("session_start", async (_event, ctx) => {
    bridge.setContext(ctx);
    await bridge.start();
  });

  pi.on("session_shutdown", async (_event, _ctx) => {
    bridge.stop();
  });

  pi.on("agent_settled", async (_event, ctx) => {
    bridge.setContext(ctx);
    await bridge.handleAgentSettled(ctx);
  });

  pi.on("ui_prompt_start", async (event, ctx) => {
    bridge.setContext(ctx);
    await bridge.handleUIPromptStart(event.title, event.kind);
  });

  // /tbuddy command
  pi.registerCommand("tbuddy", {
    description: "Telegram Companion: get alerts & steer Pi remotely from your phone",
    getArgumentCompletions: (prefix: string) => {
      const subcommands = [
        { value: "botkey", label: "botkey <token> - Set Telegram bot API key" },
        { value: "target", label: "target <chat_id> - Set target chat/user ID" },
        { value: "status", label: "status - Check Telegram bot and pairing status" },
        { value: "pair", label: "pair - Show pairing instructions" },
        { value: "test", label: "test - Send a test message to Telegram" },
        { value: "toggle", label: "toggle - Enable or disable Telegram alerts" },
        { value: "clear", label: "clear - Disconnect bot and clear saved credentials" },
      ];
      return subcommands
        .filter((s) => s.value.startsWith(prefix.trim()))
        .map((s) => ({ value: s.value, label: s.label }));
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      bridge.setContext(ctx);
      const parts = args.trim().split(/\s+/);
      const subcommand = parts[0]?.toLowerCase();
      const rest = parts.slice(1).join(" ").trim();

      switch (subcommand) {
        case "botkey": {
          let token = rest;
          if (!token) {
            token = (await ctx.ui.input("Enter Telegram Bot Token (from @BotFather):")) || "";
          }
          token = token.trim();
          if (!token) {
            ctx.ui.notify("⚠️ No bot token provided.", "warning");
            return;
          }

          ctx.ui.notify("⏳ Connecting to Telegram Bot API...", "info");
          const res = await bridge.setBotKey(token);
          if (res.ok && res.bot) {
            ctx.ui.notify(
              `✅ Connected! Bot: @${res.bot.username} (${res.bot.first_name})\n📱 Send /start to @${res.bot.username} on Telegram to pair your phone!`,
              "info"
            );
          } else {
            ctx.ui.notify(`❌ Failed to connect to bot: ${res.error}`, "error");
          }
          break;
        }

        case "target": {
          let targetId = rest;
          if (!targetId) {
            targetId = (await ctx.ui.input("Enter Telegram Chat ID (numeric):")) || "";
          }
          targetId = targetId.trim();
          if (!targetId) {
            ctx.ui.notify("⚠️ No target Chat ID provided.", "warning");
            return;
          }

          const res = await bridge.setTarget(targetId);
          if (res.ok) {
            ctx.ui.notify(`✅ Target chat set to: ${targetId}`, "info");
          } else {
            ctx.ui.notify(`⚠️ ${res.error}`, "warning");
          }
          break;
        }

        case "status": {
          const cfg = bridge.getConfig();
          const tokenMask = cfg.botToken
            ? `configured (...${cfg.botToken.slice(-5)})`
            : "❌ Not configured";
          const botUser = cfg.botUsername ? `@${cfg.botUsername}` : "N/A";
          const target = cfg.targetChatId
            ? `${cfg.targetUser || "User"} (Chat ID: ${cfg.targetChatId})`
            : "⚠️ Not paired (send /start to bot)";
          const status = cfg.enabled ? "🟢 Enabled" : "⚪ Disabled";

          ctx.ui.notify(
            `📱 Pi Telegram Buddy Status:\n• Alerts: ${status}\n• Bot: ${botUser} [${tokenMask}]\n• Target: ${target}`,
            "info"
          );
          break;
        }

        case "pair": {
          const cfg = bridge.getConfig();
          if (!cfg.botToken) {
            ctx.ui.notify("⚠️ Please configure bot token first with: /tbuddy botkey <token>", "warning");
            return;
          }
          const botName = cfg.botUsername ? `@${cfg.botUsername}` : "your bot";
          ctx.ui.notify(
            `📲 To pair your phone:\n1. Open Telegram\n2. Search for ${botName}\n3. Send /start\nYour chat will be paired automatically!`,
            "info"
          );
          break;
        }

        case "test": {
          const text = rest || "🔔 Test message from Pi on your PC! Everything is working.";
          ctx.ui.notify("⏳ Sending test ping to Telegram...", "info");
          const res = await bridge.sendToTarget(text);
          if (res.ok) {
            ctx.ui.notify("✅ Test message delivered to Telegram!", "info");
          } else {
            ctx.ui.notify(`❌ Failed to send test: ${res.error}`, "error");
          }
          break;
        }

        case "toggle": {
          const nowEnabled = bridge.toggleEnabled();
          ctx.ui.notify(`📱 Telegram alerts are now: ${nowEnabled ? "ENABLED" : "DISABLED"}`, "info");
          break;
        }

        case "clear": {
          bridge.clear();
          ctx.ui.notify("🧹 Cleared Telegram bot token and target pairing.", "info");
          break;
        }

        default: {
          ctx.ui.notify(
            "📱 /tbuddy commands:\n• /tbuddy botkey <token> - Set bot token\n• /tbuddy pair - Pairing instructions\n• /tbuddy target <chat_id> - Set target chat\n• /tbuddy status - Check status\n• /tbuddy test - Send test message\n• /tbuddy toggle - Toggle on/off\n• /tbuddy clear - Reset config",
            "info"
          );
          break;
        }
      }
    },
  });
}
