import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AUTH_COOKIE_NAME, createSessionToken, verifyPassword, verifySessionToken } from "./auth";

const originalAppPassword = process.env.APP_PASSWORD;
const originalAuthCookieSecret = process.env.AUTH_COOKIE_SECRET;

beforeEach(() => {
  process.env.APP_PASSWORD = "correct-horse-battery-staple";
  process.env.AUTH_COOKIE_SECRET = "test-only-signing-secret";
});

afterEach(() => {
  if (originalAppPassword === undefined) {
    delete process.env.APP_PASSWORD;
  } else {
    process.env.APP_PASSWORD = originalAppPassword;
  }

  if (originalAuthCookieSecret === undefined) {
    delete process.env.AUTH_COOKIE_SECRET;
  } else {
    process.env.AUTH_COOKIE_SECRET = originalAuthCookieSecret;
  }
});

describe("AUTH_COOKIE_NAME", () => {
  it("is a stable, non-empty cookie name", () => {
    expect(AUTH_COOKIE_NAME).toBe("book_notes_session");
  });
});

describe("verifyPassword", () => {
  it("returns true for the correct password", () => {
    expect(verifyPassword("correct-horse-battery-staple")).toBe(true);
  });

  it("returns false for an incorrect password", () => {
    expect(verifyPassword("wrong-password")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(verifyPassword("")).toBe(false);
  });
});

describe("createSessionToken / verifySessionToken", () => {
  it("verifies a freshly created token as valid", () => {
    const token = createSessionToken();
    expect(verifySessionToken(token)).toBe(true);
  });

  it("rejects a token with a tampered signature", () => {
    const token = createSessionToken();
    const [payload, signature] = token.split(".");
    const tamperedSignature =
      signature.slice(0, -1) + (signature.at(-1) === "0" ? "1" : "0");
    const tamperedToken = `${payload}.${tamperedSignature}`;

    expect(verifySessionToken(tamperedToken)).toBe(false);
  });

  it("rejects a token with a tampered payload (e.g. exp pushed into the future)", () => {
    const token = createSessionToken();
    const [, signature] = token.split(".");

    const forgedPayload = Buffer.from(
      JSON.stringify({ exp: Date.now() + 1000 * 60 * 60 * 24 * 365 })
    ).toString("base64url");
    const forgedToken = `${forgedPayload}.${signature}`;

    expect(verifySessionToken(forgedToken)).toBe(false);
  });

  it("rejects an expired token", () => {
    const nowMs = 1_000_000_000_000;
    const token = createSessionToken({ ttlMs: 1000, nowMs });

    // 発行時点ちょうど（期限内）では有効
    expect(verifySessionToken(token, nowMs + 500)).toBe(true);
    // 期限を過ぎた時刻で検証すると無効
    expect(verifySessionToken(token, nowMs + 1000)).toBe(false);
  });

  it("rejects malformed tokens without throwing", () => {
    expect(verifySessionToken("")).toBe(false);
    expect(verifySessionToken(undefined)).toBe(false);
    expect(verifySessionToken(null)).toBe(false);
    expect(verifySessionToken("no-dot-here")).toBe(false);
    expect(verifySessionToken("only.")).toBe(false);
    expect(verifySessionToken(".onlysignature")).toBe(false);
    expect(verifySessionToken("not-valid-base64url!!.deadbeef")).toBe(false);
  });
});
