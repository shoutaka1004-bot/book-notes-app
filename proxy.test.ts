import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { AUTH_COOKIE_NAME, createSessionToken } from "./lib/auth";

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

function requestFor(pathname: string, token?: string): NextRequest {
  return new NextRequest(`http://localhost:3000${pathname}`, {
    headers: token ? { cookie: `${AUTH_COOKIE_NAME}=${token}` } : {},
  });
}

function isPassThrough(response: Response): boolean {
  return response.headers.get("x-middleware-next") === "1";
}

describe("proxy — 通常の画面ルート", () => {
  it("Cookie無しでアクセスすると /login へリダイレクトする", () => {
    const response = proxy(requestFor("/"));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/login");
  });

  it("不正/期限切れのCookieでアクセスすると /login へリダイレクトする", () => {
    const response = proxy(requestFor("/", "not-a-valid-token"));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/login");
  });

  it("正当なセッションCookieがあれば通過する", () => {
    const token = createSessionToken();
    const response = proxy(requestFor("/", token));

    expect(isPassThrough(response)).toBe(true);
  });

  it("/login 自体はCookie無しでも通過する", () => {
    const response = proxy(requestFor("/login"));

    expect(isPassThrough(response)).toBe(true);
  });
});

describe("proxy — /api/ 配下のルート", () => {
  it("/api/login はCookie無しでも通過する", () => {
    const response = proxy(requestFor("/api/login"));

    expect(isPassThrough(response)).toBe(true);
  });

  it("Cookie無しで /api/books にアクセスすると401のJSONエラーを返す（リダイレクトしない）", async () => {
    const response = proxy(requestFor("/api/books"));

    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
    await expect(response.json()).resolves.toEqual({ error: "認証が必要です" });
  });

  it("正当なセッションCookieがあれば /api/books も通過する", () => {
    const token = createSessionToken();
    const response = proxy(requestFor("/api/books", token));

    expect(isPassThrough(response)).toBe(true);
  });
});
