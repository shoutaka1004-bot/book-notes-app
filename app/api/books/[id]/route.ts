import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createBookSchema } from "../route";
import { deleteBook, getBookById, updateBook } from "../../../../lib/db/books";

/**
 * `/api/books/[id]` の`id`が有効なUUID形式かどうかを確認するスキーマ。
 * 不正な形式のまま`lib/db/books.ts`側に渡すと、Postgresの
 * `invalid input syntax for type uuid`エラーがそのまま投げられ500になってしまうため、
 * ここで先に弾いて分かりやすい400を返す。
 */
const idSchema = z.string().uuid("idの形式が不正です");

/**
 * `books`の更新用スキーマ。`app/api/books/route.ts`の`createBookSchema`を
 * `.partial()`して流用し、バリデーションルールの重複を避ける。
 * ボディが空オブジェクトでも許容する（更新対象フィールドが0件でもエラーにしない）。
 */
const updateBookSchema = createBookSchema.partial();

type RouteContext = { params: Promise<{ id: string }> };

/**
 * 本の詳細を取得する。該当する本が存在しない場合は404を返す。
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const idParsed = idSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "idの形式が不正です" }, { status: 400 });
  }

  try {
    const book = await getBookById(idParsed.data);
    if (!book) {
      return NextResponse.json(
        { error: "指定された本が見つかりません" },
        { status: 404 }
      );
    }
    return NextResponse.json(book, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "本の詳細取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * 本の内容を更新する。該当する本が存在しない場合は404を返す。
 *
 * `lib/db/books.ts`の`updateBook`は内部で`.single()`を使っており、
 * 存在しないIDを渡すと0行更新でエラーになってしまう（`updateBook`自体は
 * レビュー済みのため変更しない）。そのため、更新前に`getBookById`で
 * 存在確認を行い、ここで404を判定してから`updateBook`を呼ぶ。
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const idParsed = idSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "idの形式が不正です" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "リクエストボディがJSONとして解析できません" },
      { status: 400 }
    );
  }

  const bodyParsed = updateBookSchema.safeParse(body);
  if (!bodyParsed.success) {
    return NextResponse.json(
      { error: "入力内容が不正です", details: z.treeifyError(bodyParsed.error) },
      { status: 400 }
    );
  }

  // 更新対象フィールドが0件の場合、`updateBook`内部の`.update({}).single()`が
  // 0行更新となり「Cannot coerce the result to a single JSON object」という
  // 分かりにくいエラーで500になってしまう（実機で確認済み）。`updateBook`自体は
  // レビュー済みで変更しない方針のため、ここで明示的に400として弾く。
  if (Object.keys(bodyParsed.data).length === 0) {
    return NextResponse.json(
      { error: "更新する項目が1つも指定されていません" },
      { status: 400 }
    );
  }

  try {
    const existing = await getBookById(idParsed.data);
    if (!existing) {
      return NextResponse.json(
        { error: "指定された本が見つかりません" },
        { status: 404 }
      );
    }

    const updated = await updateBook(idParsed.data, bodyParsed.data);
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "本の更新に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * 本を削除する。該当する本が存在しない場合は404を返す。
 *
 * `lib/db/books.ts`の`deleteBook`は0件削除でもエラーにならないため、
 * 事前に`getBookById`で存在確認を行わないと「存在しないIDのDELETE」が
 * 200で成功してしまい、GET/PUTとの404の一貫性が崩れる。
 *
 * 成功時は204（ボディなし）ではなく200 + `{ success: true }`を返す
 * （POST/PUT同様、呼び出し側が無条件で`res.json()`を呼んでも壊れないように、
 * このAPI群は常にJSONボディを返す方針で統一する）。
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const idParsed = idSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: "idの形式が不正です" }, { status: 400 });
  }

  try {
    const existing = await getBookById(idParsed.data);
    if (!existing) {
      return NextResponse.json(
        { error: "指定された本が見つかりません" },
        { status: 404 }
      );
    }

    await deleteBook(idParsed.data);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "本の削除に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
