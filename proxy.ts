import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifySessionToken } from "./lib/auth";

/**
 * 認証チェックの対象外にするパス（完全一致）。
 * `/login`: ログイン画面自体。`/api/login`: ログインAPI。
 * `/api/logout`: ログアウトAPI。Cookieが期限切れ・破損している状態でもログアウト
 * （状態のリセット）を試みられるよう、常に到達可能にしておく（失敗させる実害が無い操作のため）。
 */
const PUBLIC_PATHS = new Set(["/login", "/api/login", "/api/logout"]);

/**
 * 未ログイン状態でアクセスされたリクエストをガードするproxy（旧middleware。
 * Next.js 16でファイル規約が`middleware`から`proxy`に改称され、既定の実行環境も
 * Node.js runtimeになった。これにより`lib/auth.ts`が使う`node:crypto`が利用できる）。
 *
 * - `/login` と `/api/login`、`/api/logout` は認証チェック対象外（常に通過）
 * - それ以外の `/api/` 配下のパスは、未認証の場合 `/login` へのリダイレクトではなく
 *   JSON形式の401エラーを返す。fetchで呼ばれる想定のAPIルートに対してHTMLのリダイレクト先を
 *   返すと、fetchがデフォルトでリダイレクトを追跡してしまい、JSONを期待するクライアント側が
 *   ログイン画面のHTMLを受け取って壊れるため
 * - それ以外の通常の画面ルートは、未認証の場合 `/login` へリダイレクトする
 */
export function proxy(request: NextRequest) {
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
