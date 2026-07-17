import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createBook, listBooks } from "../../../lib/db/books";

/**
 * `books.finished_date`（DBの`date`型）に対応する入力形式。
 * `YYYY-MM-DD`以外の文字列は、DBの生エラー（500）ではなくここで分かりやすい400エラーとして弾く。
 */
const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `books`テーブルへの新規作成リクエストボディのスキーマ。
 * `title`のみ必須（マイグレーションSQLで`not null`）で、他は全てnullable + optional
 * （マイグレーションSQLで他の列は全てnullable、`NewBookInput`の型定義と一致させている）。
 */
export const createBookSchema = z.object({
  title: z.string().min(1, "titleは必須です"),
  author: z.string().nullable().optional(),
  publisher: z.string().nullable().optional(),
  isbn: z.string().nullable().optional(),
  cover_url: z.string().nullable().optional(),
  rating: z
    .number()
    .int("ratingは整数で指定してください")
    .min(1, "ratingは1〜5の範囲で指定してください")
    .max(5, "ratingは1〜5の範囲で指定してください")
    .nullable()
    .optional(),
  one_line_summary: z.string().nullable().optional(),
  content_summary: z.string().nullable().optional(),
  why_resonated: z.string().nullable().optional(),
  how_to_apply: z.string().nullable().optional(),
  surprising_point: z.string().nullable().optional(),
  quote: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  finished_date: z
    .string()
    .regex(dateOnlyRegex, "finished_dateはYYYY-MM-DD形式で指定してください")
    .nullable()
    .optional(),
});

/**
 * 本の一覧を取得する（新しく記録したものが先頭に来る順序、`lib/db/books.ts`の`listBooks`に準拠）。
 */
export async function GET() {
  try {
    const books = await listBooks();
    return NextResponse.json(books, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "本の一覧取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * 本を新規作成する。リクエストボディはJSON、`title`のみ必須。
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

  const parsed = createBookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力内容が不正です", details: z.treeifyError(parsed.error) },
      { status: 400 }
    );
  }

  try {
    const created = await createBook(parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "本の作成に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
