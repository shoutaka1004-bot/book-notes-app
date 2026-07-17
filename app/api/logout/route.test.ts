import { describe, expect, it } from "vitest";
import { POST } from "./route";
import { AUTH_COOKIE_NAME } from "../../../lib/auth";

describe("POST /api/logout", () => {
  it("returns 200 and clears the session cookie", async () => {
    const res = await POST();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);

    const setCookie = res.cookies.get(AUTH_COOKIE_NAME);
    expect(setCookie).toBeTruthy();
    expect(setCookie?.value).toBe("");
    expect(setCookie?.maxAge).toBe(0);
    expect(setCookie?.httpOnly).toBe(true);
    expect(setCookie?.sameSite).toBe("lax");
    expect(setCookie?.path).toBe("/");
  });

  it("returns 200 even when called without an existing session (idempotent)", async () => {
    // POSTハンドラはリクエストの中身（Cookieの有無）を見ないため、
    // 未ログイン状態からの呼び出しも同じ挙動になることを確認する。
    const res = await POST();
    expect(res.status).toBe(200);
  });
});
