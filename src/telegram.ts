export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export class TelegramClient {
  private baseUrl: string;
  private token: string;

  constructor(token: string) {
    this.token = token;
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  setToken(token: string): void {
    this.token = token;
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  async getMe(): Promise<TelegramUser> {
    const res = await fetch(`${this.baseUrl}/getMe`);
    const data = (await res.json()) as TelegramApiResponse<TelegramUser>;
    if (!data.ok || !data.result) {
      throw new Error(data.description || `HTTP ${res.status}: Failed to getMe`);
    }
    return data.result;
  }

  async sendMessage(
    chatId: number | string,
    text: string,
    opts?: { parse_mode?: "HTML" | "Markdown" | "MarkdownV2" }
  ): Promise<TelegramMessage> {
    // If text exceeds Telegram limit of 4096 chars, truncate gracefully
    const MAX_LEN = 4000;
    const bodyText = text.length > MAX_LEN ? text.slice(0, MAX_LEN - 20) + "\n\n...[truncated]" : text;

    try {
      const res = await fetch(`${this.baseUrl}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: bodyText,
          parse_mode: opts?.parse_mode,
        }),
      });

      const data = (await res.json()) as TelegramApiResponse<TelegramMessage>;
      if (!data.ok) {
        // If Markdown parsing failed, retry as plain text
        if (opts?.parse_mode && data.description?.includes("can't parse entities")) {
          return this.sendMessage(chatId, text, undefined);
        }
        throw new Error(data.description || `Failed to sendMessage: HTTP ${res.status}`);
      }
      return data.result!;
    } catch (err) {
      if (opts?.parse_mode) {
        // Retry without markdown on network or unknown parsing errors
        return this.sendMessage(chatId, text, undefined);
      }
      throw err;
    }
  }

  async getUpdates(offset?: number, timeout = 25, signal?: AbortSignal): Promise<TelegramUpdate[]> {
    const url = new URL(`${this.baseUrl}/getUpdates`);
    if (offset !== undefined) url.searchParams.set("offset", String(offset));
    url.searchParams.set("timeout", String(timeout));
    url.searchParams.set("allowed_updates", JSON.stringify(["message"]));

    const res = await fetch(url.toString(), { signal });
    const data = (await res.json()) as TelegramApiResponse<TelegramUpdate[]>;
    if (!data.ok || !data.result) {
      throw new Error(data.description || `Failed to getUpdates: HTTP ${res.status}`);
    }
    return data.result;
  }
}

export type MessageHandler = (msg: TelegramMessage) => Promise<void> | void;
export type PairHandler = (user: TelegramUser, chat: TelegramChat) => Promise<void> | void;

export class TelegramPoller {
  private running = false;
  private abortController: AbortController | null = null;
  private offset?: number;
  private client: TelegramClient;
  private getTargetChatId: () => number | string | undefined;
  private onMessage: MessageHandler;
  private onPair: PairHandler;

  constructor(
    client: TelegramClient,
    getTargetChatId: () => number | string | undefined,
    onMessage: MessageHandler,
    onPair: PairHandler
  ) {
    this.client = client;
    this.getTargetChatId = getTargetChatId;
    this.onMessage = onMessage;
    this.onPair = onPair;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.abortController = new AbortController();
    void this.pollLoop();
  }

  stop(): void {
    this.running = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  private async pollLoop(): Promise<void> {
    while (this.running) {
      try {
        const signal = this.abortController?.signal;
        const updates = await this.client.getUpdates(this.offset, 20, signal);

        for (const update of updates) {
          this.offset = update.update_id + 1;
          const msg = update.message;
          if (!msg || !msg.text) continue;

          const targetId = this.getTargetChatId();
          const isTarget = targetId !== undefined && String(msg.chat.id) === String(targetId);

          const trimmed = msg.text.trim();
          if (trimmed.startsWith("/start") || trimmed.startsWith("/pair")) {
            // Pairing trigger
            await this.onPair(msg.from || { id: msg.chat.id, is_bot: false, first_name: msg.chat.first_name || "User" }, msg.chat);
          } else if (isTarget) {
            await this.onMessage(msg);
          } else {
            // Unauthorized sender
            try {
              await this.client.sendMessage(
                msg.chat.id,
                `🔒 Pi Telegram Buddy: This bot is currently paired to another user or chat.\nYour Chat ID is: ${msg.chat.id}\nRun \`/tbuddy target ${msg.chat.id}\` in Pi to authorize this chat.`
              );
            } catch {
              // Ignore failure to reply to unauthorized users
            }
          }
        }
      } catch (err: unknown) {
        if (!this.running) break;
        // Don't crash on aborted network requests or transient timeouts
        const isAbort = err instanceof Error && (err.name === "AbortError" || err.message.includes("abort"));
        if (!isAbort) {
          // Wait 4 seconds on error before retrying to prevent busy looping
          await new Promise((resolve) => setTimeout(resolve, 4000));
        }
      }
    }
  }
}
