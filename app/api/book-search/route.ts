import { NextRequest, NextResponse } from "next/server";
import { searchBooksByKeyword } from "../../../lib/bookSearch";

/**
 * キーワードから書籍候補を検索する（NDL Search＝国立国会図書館サーチを利用）。
 * `keyword`クエリパラメータは必須で、空文字・空白のみの場合は400を返す
 * （`searchBooksByKeyword`自体は空キーワードに対して例外を投げず空配列を返す実装だが、
 * このAPIルートでは「キーワード未指定」を利用者の入力ミスとして明示的に弾く方針にする）。
 *
 * `searchBooksByKeyword`はNDL Searchへ内部で1回だけ呼び出す（内部で既にtitle/creatorの
 * 2リクエストを発行しているため、ここから複数回呼ぶと更に倍加してしまう）。
 *
 * NDL Search自体の障害（通信失敗・非200・XML解析失敗）は、このAPIルート自身のバグ
 * ではなく上流サービスの障害であるため、自サーバ起因のエラーに使っている500ではなく
 * 502（Bad Gateway）を返す。
 */
export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get("keyword");

  if (!keyword || keyword.trim() === "") {
    return NextResponse.json(
      { error: "keywordクエリパラメータは必須です" },
      { status: 400 }
    );
  }

  try {
    const results = await searchBooksByKeyword(keyword);
    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "書籍検索に失敗しました";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
