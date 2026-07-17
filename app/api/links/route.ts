import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createLink,
  deleteLink,
  listAllLinks,
  listLinksForBook,
} from "../../../lib/db/links";
import { getBookById } from "../../../lib/db/books";

/**
 * `?bookId=`クエリパラメータが有効なUUID形式かどうかを確認するスキーマ。
 * `lib/db/links.ts`の`listLinksForBook`は`bookId`を`.or()`フィルタ文字列に直接
 * 埋め込んでいる（PostgRESTのフィルタ構文への注入の余地がある）ため、
 * バリデーションを経ない生の文字列を渡さないよう、ここで先に形式を確認する。
 */
const bookIdQuerySchema = z.string().uuid("bookIdの形式が不正です");

/**
 * `book_links`への新規作成リクエストボディのスキーマ。
 * `from_book_id`/`to_book_id`のUUID形式チェックに加え、自己参照
 * （DB制約`book_links_no_self_link`が禁止しているのと同じ条件）をここで
 * 先に弾き、分かりやすい400を返す。
 */
const createLinkSchema = z
  .object({
    from_book_id: z.string().uuid("from_book_idの形式が不正です"),
    to_book_id: z.string().uuid("to_book_idの形式が不正です"),
    note: z.string().nullable().optional(),
    // 関連度（1〜3）。省略時は`createLink`側でDBのデフォルト値(2)に委ねる。
    // z.coerce.number()は使わない — 文字列値("2"等)も型強制で通ってしまい、
    // 「文字列は400で拒否する」という仕様と矛盾するため。
    strength: z.number().int().min(1).max(3).optional(),
  })
  .refine((data) => data.from_book_id !== data.to_book_id, {
    message: "自分自身へのリンクは作成できません",
    path: ["to_book_id"],
  });

/**
 * リンク削除リクエストボディのスキーマ。`links/[id]/route.ts`は作らない設計
 * （BRIEF.md第4-3節のディレクトリ構成に合わせる）のため、削除対象の`id`は
 * パスではなくボディで受け取る。
 */
const deleteLinkSchema = z.object({
  id: z.string().uuid("idの形式が不正です"),
});

/**
 * リンク一覧を取得する。
 *
 * - `bookId`クエリパラメータあり: その本に紐づくリンクを、本情報・向き(`direction`)付きで返す
 *   （`BookLinkWithBook[]`、既存の挙動を変更しない）。存在しない本の`bookId`を渡した場合も
 *   エラーにせず空配列を返す（`listLinksForBook`はフィルタに一致する行が無いだけであり、
 *   本自体の存在確認は行わない。一覧取得はGETの性質上、副作用が無く実害も無いため）。
 * - `bookId`省略: 全リンクを本情報のJOIN無しでそのまま返す（`BookLink[]`）。相関図画面
 *   （`app/graph/page.tsx`、タスク24）が`GET /api/books`（全件）と突き合わせて使う用途で、
 *   本の詳細情報はここでは持たせない。
 */
export async function GET(request: NextRequest) {
  const bookId = request.nextUrl.searchParams.get("bookId");

  if (!bookId) {
    try {
      const links = await listAllLinks();
      return NextResponse.json(links, { status: 200 });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "本のリンク全件取得に失敗しました";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const bookIdParsed = bookIdQuerySchema.safeParse(bookId);
  if (!bookIdParsed.success) {
    return NextResponse.json({ error: "bookIdの形式が不正です" }, { status: 400 });
  }

  try {
    const links = await listLinksForBook(bookIdParsed.data);
    return NextResponse.json(links, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "本のリンク一覧取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * 2冊の本の間にリンクを作成する。
 *
 * 参照先の本（`from_book_id`/`to_book_id`）がどちらも存在することを事前に
 * `getBookById`で確認してから`createLink`を呼ぶ（存在しないIDのままDBに渡すと
 * 外部キー制約違反の生エラーで500になってしまうため、`app/api/books/[id]/route.ts`
 * のPUT/DELETEと同じ「事前存在確認」パターンを踏襲する）。
 *
 * 重複ペアは、DB制約`book_links_unique_pair`（`unique (from_book_id, to_book_id)`）
 * だけでは向き込みの一意制約のため、A→Bが既にある状態でB→Aを作成しようとすると
 * DB制約に引っかからず201で成功してしまう（実機で確認済み）。これは「この2冊は
 * 既にリンクされている」という利用者の期待・エラーメッセージの意図と矛盾するため、
 * `createLink`を呼ぶ前に`listLinksForBook(from_book_id)`（既存関数、変更なし）で
 * `to_book_id`が向きに関わらず既に含まれていないか確認し、含まれていればDBに到達
 * させず400を返す。DB制約側は`book_links_unique_pair`の完全一致（同じ向きの重複）
 * のみを検出するため、その場合のフォールバックとして`createLink`が投げるエラー
 * メッセージに制約名`book_links_unique_pair`が含まれるかどうかでも判定する。
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

  const parsed = createLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力内容が不正です", details: z.treeifyError(parsed.error) },
      { status: 400 }
    );
  }

  const { from_book_id, to_book_id, note } = parsed.data;

  try {
    const [fromBook, toBook] = await Promise.all([
      getBookById(from_book_id),
      getBookById(to_book_id),
    ]);
    if (!fromBook || !toBook) {
      return NextResponse.json(
        { error: "指定された本が見つかりません" },
        { status: 404 }
      );
    }

    const existingLinks = await listLinksForBook(from_book_id);
    const alreadyLinked = existingLinks.some((link) => link.book.id === to_book_id);
    if (alreadyLinked) {
      return NextResponse.json(
        { error: "この2冊の本は既にリンクされています" },
        { status: 400 }
      );
    }

    const created = await createLink(from_book_id, to_book_id, note, parsed.data.strength);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("book_links_unique_pair")) {
      return NextResponse.json(
        { error: "この2冊の本は既にリンクされています" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: message || "本のリンク作成に失敗しました" },
      { status: 500 }
    );
  }
}

/**
 * リンクを削除する。削除は冪等な操作として扱い、存在しない/既に削除済みの
 * `id`を指定した場合もエラーにせず200を返す（`lib/db/links.ts`の`deleteLink`
 * 自体が0行削除でもエラーにならない挙動に合わせ、存在確認用の新規関数は追加しない）。
 */
export async function DELETE(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "リクエストボディがJSONとして解析できません" },
      { status: 400 }
    );
  }

  const parsed = deleteLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "idの形式が不正です" }, { status: 400 });
  }

  try {
    await deleteLink(parsed.data.id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "本のリンク削除に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
