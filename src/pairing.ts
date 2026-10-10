import { randomInt } from "node:crypto";

/** Unambiguous characters (no 0/O, 1/I/L). */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;
export const CODE_TTL_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 5;

export type PairCheck = { ok: true } | { ok: false; reason: "none" | "expired" | "wrong" | "locked" };

/** One-time pairing code shown in Pi and typed on the phone. Lives in memory only. */
export class PairingCodes {
  private code?: string;
  private expiresAt = 0;
  private attempts = 0;
  private now: () => number;
  constructor(now: () => number = Date.now) { this.now = now; }

  issue(): { code: string; expiresAt: number } {
    this.code = Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    this.expiresAt = this.now() + CODE_TTL_MS;
    this.attempts = 0;
    return { code: this.code, expiresAt: this.expiresAt };
  }

  active(): boolean { return !!this.code && this.now() < this.expiresAt; }

  /** Check a submitted code. A correct code is consumed; too many wrong tries cancel the code. */
  check(input: string | undefined): PairCheck {
    if (!this.code) return { ok: false, reason: "none" };
    if (this.now() >= this.expiresAt) { this.cancel(); return { ok: false, reason: "expired" }; }
    const given = (input || "").trim().toUpperCase().replace(/[\s-]/g, "");
    if (given && given === this.code) { this.cancel(); return { ok: true }; }
    this.attempts++;
    if (this.attempts >= MAX_ATTEMPTS) { this.cancel(); return { ok: false, reason: "locked" }; }
    return { ok: false, reason: "wrong" };
  }

  cancel(): void { this.code = undefined; this.expiresAt = 0; this.attempts = 0; }
}

/** Code from "/pair CODE", "/pair@bot CODE" or a deep link's "/start CODE". */
export function codeFromCommand(text: string): string | undefined {
  return /^\/(?:start|pair)(?:@\w+)?\s+(\S+)/.exec(text.trim())?.[1];
}
