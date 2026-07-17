import { NextRequest, NextResponse } from "next/server";
import { getBookInfoByIsbn } from "../../../lib/openbd";

/**
 * ISBNから表紙画像URL・出版社・出版日等の書誌情報を取得する（openBDを利用）。
 * `isbn`クエリパラメータは必須で、空文字・空白のみの場合は400を返す
 * （`app/api/book-search/route.ts`のkeywordパラメータの扱いと同じ方針）。
 *
 * 該当ISBNの書誌情報が存在しない場合、`getBookInfoByIsbn`はエラーではなく`null`を返す
 * ため、このAPIルートも200でボディ`null`を返す（フロントエンドはこれを「自動取得できな
 * かった」として扱い、手動入力を継続させる）。
 *
 * openBD自体の障害（通信失敗・非200・JSON解析失敗）は、このAPIルート自身のバグではなく
 * 上流サービスの障害であるため、`book-search`ルートと同様に502（Bad Gateway）を返す。
 */
export async function GET(request: NextRequest) {
  const isbn = request.nextUrl.searchParams.get("isbn");

  if (!isbn || isbn.trim() === "") {
    return NextResponse.json(
      { error: "isbnクエリパラメータは必須です" },
      { status: 400 }
    );
  }

  try {
    const info = await getBookInfoByIsbn(isbn);
    return NextResponse.json(info, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "書誌情報の取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
