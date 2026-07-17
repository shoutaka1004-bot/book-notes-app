import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { AUTH_COOKIE_NAME, verifySessionToken } from "../../../lib/auth";

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

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawPostRequest(rawBody: string): NextRequest {
  return new NextRequest("http://localhost/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

describe("POST /api/login", () => {
  it("returns 200 and sets a valid session cookie for the correct password", async () => {
    const res = await POST(postRequest({ password: "correct-horse-battery-staple" }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);

    const setCookie = res.cookies.get(AUTH_COOKIE_NAME);
    expect(setCookie).toBeTruthy();
    expect(verifySessionToken(setCookie?.value)).toBe(true);
    expect(setCookie?.httpOnly).toBe(true);
    expect(setCookie?.sameSite).toBe("lax");
    expect(setCookie?.path).toBe("/");
    expect(setCookie?.maxAge).toBe(30 * 24 * 60 * 60);
  });

  it("returns 401 and does not set a cookie for an incorrect password", async () => {
    const res = await POST(postRequest({ password: "wrong-password" }));
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(res.cookies.get(AUTH_COOKIE_NAME)).toBeUndefined();
  });

  it("returns 400 for an empty password", async () => {
    const res = await POST(postRequest({ password: "" }));
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when password is missing", async () => {
    const res = await POST(postRequest({}));
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when password has the wrong type", async () => {
    const res = await POST(postRequest({ password: 12345 }));
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when the request body is not valid JSON", async () => {
    const res = await POST(rawPostRequest("{not-json"));
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("リクエストボディがJSONとして解析できません");
  });
});
