import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AUTH_COOKIE_NAME, createSessionToken, verifyPassword } from "../../../lib/auth";

/**
 * Cookieの有効期限（秒）。`lib/auth.ts`のセッショントークン既定TTL（30日）と一致させる。
 */
const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const loginSchema = z.object({
  password: z.string().min(1, "パスワードを入力してください"),
});

/**
 * ログインする。パスワードが一致すれば、署名付きセッショントークンをCookieとして発行する。
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "リクエストボディがJSONとして解析できません" },
      { status: 400 }
    );
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "パスワードを入力してください" }, { status: 400 });
  }

  if (!verifyPassword(parsed.data.password)) {
    return NextResponse.json({ error: "パスワードが正しくありません" }, { status: 401 });
  }

  const token = createSessionToken();
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    // ローカル開発（http）でも動作するよう、本番環境のみsecure属性を付ける。
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });

  return response;
}
