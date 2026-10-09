import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, saveConfig, type TBuddyConfig } from "./config.ts";
import { TelegramClient, TelegramPoller, type TelegramChat, type TelegramMessage, type TelegramUser } from "./telegram.ts";
import { markdownToTelegramHtml } from "./markdown.ts";

export class TBuddyBridge {
  private config: TBuddyConfig;
  private client: TelegramClient | null = null;
  private poller: TelegramPoller | null = null;
  private activeContext: ExtensionContext | null = null;
  private pi: ExtensionAPI;

  constructor(pi: ExtensionAPI) {
    this.pi = pi;
    this.config = loadConfig();
    if (this.config.botToken) {
      this.initClient(this.config.botToken);
    }
  }

  setContext(ctx: ExtensionContext): void {
    this.activeContext = ctx;
  }

  getConfig(): TBuddyConfig {
    return this.config;
  }

  private initClient(token: string): void {
    this.client = new TelegramClient(token);
    this.poller = new TelegramPoller(
      this.client,
      () => this.config.targetChatId,
      (msg) => this.handleIncomingMessage(msg),
      (user, chat) => this.handlePairRequest(user, chat)
    );
  }

  async start(): Promise<void> {
    if (!this.config.botToken || !this.poller) return;
    if (!this.poller.isRunning()) {
      this.poller.start();
    }
  }

  stop(): void {
    if (this.poller && this.poller.isRunning()) {
      this.poller.stop();
    }
  }

  async setBotKey(token: string): Promise<{ ok: boolean; bot?: TelegramUser; error?: string }> {
    try {
      const client = new TelegramClient(token);
      const bot = await client.getMe();
      this.config = saveConfig({
        botToken: token,
        botUsername: bot.username,
      });

      this.stop();
      this.initClient(token);
      this.start();

      return { ok: true, bot };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  async setTarget(chatId: number | string): Promise<{ ok: boolean; error?: string }> {
    this.config = saveConfig({
      targetChatId: chatId,
    });

    if (this.client) {
      try {
        const md = "🎉 **Pi Telegram Buddy Connected!**\nThis chat is now set as the active target for Pi alerts and remote control.";
        await this.client.sendMessage(chatId, markdownToTelegramHtml(md), { parse_mode: "HTML" });
      } catch (err: any) {
        return { ok: true, error: `Saved target, but failed to send ping: ${err.message}` };
      }
    }
    return { ok: true };
  }

  toggleEnabled(): boolean {
    const next = !this.config.enabled;
    this.config = saveConfig({ enabled: next });
    return next;
  }

  clear(): void {
    this.stop();
    this.client = null;
    this.poller = null;
    this.config = saveConfig({
      botToken: undefined,
      botUsername: undefined,
      targetChatId: undefined,
      targetUser: undefined,
    });
  }

  async sendToTarget(text: string, parseMode?: "Markdown" | "HTML"): Promise<{ ok: boolean; error?: string }> {
    if (!this.client || !this.config.botToken) {
      return { ok: false, error: "Bot token not configured. Run /tbuddy botkey <token>" };
    }
    if (!this.config.targetChatId) {
      return { ok: false, error: "Target chat not configured. Run /tbuddy target <chat_id> or send /start on Telegram" };
    }

    try {
      await this.client.sendMessage(this.config.targetChatId, text, { parse_mode: parseMode });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  // --- Telegram Incoming Events ---

  private async handlePairRequest(user: TelegramUser, chat: TelegramChat): Promise<void> {
    const displayName = user.username ? `@${user.username}` : `${user.first_name} ${user.last_name || ""}`.trim();
    this.config = saveConfig({
      targetChatId: chat.id,
      targetUser: displayName,
    });

    if (this.client) {
      const md = `🎉 **Successfully paired with Pi!**\n\n• Target User: ${displayName}\n• Chat ID: \`${chat.id}\`\n\nYou'll now receive alerts when Pi finishes tasks or needs input.\nType any message here to send it directly to your Pi session!`;
      await this.client.sendMessage(chat.id, markdownToTelegramHtml(md), { parse_mode: "HTML" });
    }

    if (this.activeContext) {
      this.activeContext.ui.notify(
        `🎉 Telegram paired with ${displayName} (Chat ID: ${chat.id})`,
        "info"
      );
    }
  }

  private async handleIncomingMessage(msg: TelegramMessage): Promise<void> {
    const text = (msg.text || "").trim();
    if (!text) return;

    const ctx = this.activeContext;

    // Built-in Telegram commands
    if (text === "/status") {
      const isIdle = ctx ? ctx.isIdle() : true;
      const cwd = ctx ? ctx.cwd : process.cwd();
      const model = ctx?.model?.id || "default";

      if (this.client) {
        const md = `💻 **Pi Status Report**\n\n• **Status:** ${isIdle ? "🟢 Idle (ready)" : "⚡ Working / Thinking"}\n• **Directory:** \`${cwd}\`\n• **Model:** \`${model}\``;
        await this.client.sendMessage(msg.chat.id, markdownToTelegramHtml(md), { parse_mode: "HTML" });
      }
      return;
    }

    if (text === "/abort" || text === "/stop") {
      if (ctx && !ctx.isIdle()) {
        ctx.abort();
        if (this.client) {
          await this.client.sendMessage(msg.chat.id, "🛑 <b>Aborted active Pi run.</b>", { parse_mode: "HTML" });
        }
        ctx.ui.notify("🛑 Aborted run via Telegram /abort command", "warning");
      } else {
        if (this.client) {
          await this.client.sendMessage(msg.chat.id, "ℹ️ Pi is already idle.", { parse_mode: "HTML" });
        }
      }
      return;
    }

    if (text === "/help") {
      if (this.client) {
        const md = `🤖 **Pi Telegram Buddy Commands:**\n\n• Just send any normal text to prompt or reply to Pi!\n• \`/status\` - Check if Pi is idle or working\n• \`/abort\` - Stop the current thinking/execution\n• \`/help\` - Show this message`;
        await this.client.sendMessage(msg.chat.id, markdownToTelegramHtml(md), { parse_mode: "HTML" });
      }
      return;
    }

    // Normal message -> inject into Pi
    if (ctx) {
      const preview = text.length > 50 ? text.slice(0, 47) + "..." : text;
      ctx.ui.notify(`📩 [Telegram] ${msg.from?.first_name || "User"}: "${preview}"`, "info");
      
      const isIdle = ctx.isIdle();
      this.pi.sendUserMessage(text, {
        deliverAs: isIdle ? undefined : "steer",
      });

      if (this.client) {
        const md = `📨 **Forwarded to Pi:** "${preview}"`;
        await this.client.sendMessage(msg.chat.id, markdownToTelegramHtml(md), { parse_mode: "HTML" });
      }
    }
  }

  // --- Pi Lifecycle Event Helpers ---

  async handleAgentSettled(ctx: ExtensionContext): Promise<void> {
    if (!this.config.enabled || !this.config.notifyOnSettled) return;
    if (!this.config.botToken || !this.config.targetChatId) return;

    const lastText = this.extractLastAssistantText(ctx);
    const fullText = lastText ? lastText.trim() : "Turn finished with no response text.";
    const maxBodyLen = 3500;
    const summary = fullText.length > maxBodyLen
      ? fullText.slice(0, maxBodyLen) + "\n\n...[truncated]"
      : fullText;

    const rawMarkdown = `✅ **Pi Finished Task**\n📁 \`${ctx.cwd}\`\n\n${summary}\n\n💬 *Reply to this message on Telegram to steer or continue.*`;
    const htmlMessage = markdownToTelegramHtml(rawMarkdown);

    await this.sendToTarget(htmlMessage, "HTML");
  }

  async handleUIPromptStart(title: string | undefined, kind: string): Promise<void> {
    if (!this.config.enabled || !this.config.notifyOnInput) return;
    if (!this.config.botToken || !this.config.targetChatId) return;

    const rawMarkdown = `⚠️ **Pi Needs Input!**\n\nPrompt: ${title || kind}\n\n💬 *Reply directly here with your answer or choice.*`;
    const htmlMessage = markdownToTelegramHtml(rawMarkdown);
    await this.sendToTarget(htmlMessage, "HTML");
  }

  private extractLastAssistantText(ctx: ExtensionContext): string | undefined {
    try {
      const entries = ctx.sessionManager.buildContextEntries();
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i] as any;
        if (entry.type === "message" && entry.message?.role === "assistant") {
          const msg = entry.message;
          if (typeof msg.content === "string") return msg.content;
          if (Array.isArray(msg.content)) {
            const textParts = msg.content
              .filter((c: any) => c.type === "text" && typeof c.text === "string")
              .map((c: any) => c.text);
            if (textParts.length > 0) return textParts.join("\n");
          }
        }
      }
    } catch {
      // Fallback
    }
    return undefined;
  }
}
