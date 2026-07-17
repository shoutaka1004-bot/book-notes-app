import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "../../../lib/auth";

/**
 * ログアウトする。セッションCookieを削除する。
 *
 * 未ログイン状態（Cookie無し・期限切れ・破損済み）から呼ばれた場合もエラーにせず、
 * 常に200を返す（「ログアウト済みの状態にする」という冪等な操作として扱う。
 * `proxy.ts`の`PUBLIC_PATHS`にもこのパスを含めており、認証チェックより先に到達できる）。
 *
 * 注意（既知の制約、タスク7時点からの既存設計）: `lib/auth.ts`のセッショントークンは
 * 署名+有効期限のみのステートレス設計であり、サーバー側にセッション一覧を保持しない。
 * そのためこの操作は「ブラウザにCookieを消させる」ことしか行えず、発行済みトークンの値を
 * （ブラウザを介さず）手動で保持して再送すれば、有効期限内であれば認証は通り続ける。
 * サーバー側での即時失効が必要な場合は別途トークンのブラックリスト等の仕組みが要る。
 */
export async function POST() {
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
