import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifySessionToken } from "./lib/auth";

/**
 * 認証チェックの対象外にするパス（完全一致）。
 * `/login`: ログイン画面自体。`/api/login`: ログインAPI（未実装だがmatcherから除外しておく）。
 */
const PUBLIC_PATHS = new Set(["/login", "/api/login"]);

/**
 * 未ログイン状態でアクセスされたリクエストをガードするmiddleware。
 *
 * - `/login` と `/api/login` は認証チェック対象外（常に通過）
 * - それ以外の `/api/` 配下のパスは、未認証の場合 `/login` へのリダイレクトではなく
 *   JSON形式の401エラーを返す。fetchで呼ばれる想定のAPIルートに対してHTMLのリダイレクト先を
 *   返すと、fetchがデフォルトでリダイレクトを追跡してしまい、JSONを期待するクライアント側が
 *   ログイン画面のHTMLを受け取って壊れるため
 * - それ以外の通常の画面ルートは、未認証の場合 `/login` へリダイレクトする
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (verifySessionToken(token)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // `_next/static` / `_next/image` / `favicon.ico` を除外しないと、未ログイン状態で
  // `/login` ページ自体を開いた際にそのページを描画するJS/CSSバンドルの取得までブロックされてしまう。
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
