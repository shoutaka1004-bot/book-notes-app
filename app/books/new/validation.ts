import { z } from "zod";

/**
 * 登録フォーム（`app/books/new/page.tsx`のフォームステップ）向けのクライアント側バリデーション。
 * `app/api/books/route.ts`の`createBookSchema`（サーバー側）より厳しい制約
 * （文字数上限、ratingの必須化）を課す、UI入力時点でのフレンドリーなバリデーション用。
 * サーバー側スキーマはこのタスクでは変更しない。
 *
 * `isbn`/`cover_url`はこのスキーマの対象外（ユーザーが直接入力する項目ではなく、
 * 検索候補選択結果・openBD取得結果からそのまま引き継ぐ値のため）。
 */

/** `YYYY-MM-DD`形式チェック。`app/api/books/route.ts`の`dateOnlyRegex`と同一パターンだが、
 * サーバー側モジュールをクライアントバンドルに含めないため独立して定義する。 */
const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;

export const MAX_LENGTHS = {
  one_line_summary: 100,
  content_summary: 2000,
  why_resonated: 1000,
  how_to_apply: 1000,
  surprising_point: 500,
  quote: 500,
} as const;

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;

/** 空文字列（trim後）を`undefined`に変換する。任意項目の「未入力」を表すため。 */
function emptyToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** 任意の文字数上限付きテキスト項目用のスキーマを生成する。 */
function optionalBoundedText(maxLength: number, fieldLabel: string) {
  return z
    .string()
    .transform(emptyToUndefined)
    .pipe(
      z
        .string()
        .max(maxLength, `${fieldLabel}は${maxLength}文字以内で入力してください`)
        .optional()
    );
}

/**
 * カンマ区切りの1テキスト入力を`string[]`に変換した上で、件数・各要素の文字数を検証する。
 */
const tagsSchema = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag !== "")
  )
  .pipe(
    z
      .array(z.string())
      .max(MAX_TAGS, `タグは${MAX_TAGS}個までにしてください`)
      .refine(
        (tags) => tags.every((tag) => tag.length <= MAX_TAG_LENGTH),
        `タグは1つあたり${MAX_TAG_LENGTH}文字以内にしてください`
      )
  );

export const bookFormSchema = z.object({
  title: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, "書名を入力してください")),
  author: z.string().transform(emptyToUndefined).optional(),
  publisher: z.string().transform(emptyToUndefined).optional(),
  rating: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() !== "" ? Number(value) : undefined,
    z
      .number({ error: "評価を選択してください" })
      .int("評価は1〜5で選択してください")
      .min(1, "評価は1〜5で選択してください")
      .max(5, "評価は1〜5で選択してください")
  ),
  finished_date: z
    .string()
    .transform(emptyToUndefined)
    .pipe(
      z
        .string()
        .regex(dateOnlyRegex, "完読日はYYYY-MM-DD形式で入力してください")
        .optional()
    ),
  one_line_summary: optionalBoundedText(
    MAX_LENGTHS.one_line_summary,
    "一言要約"
  ),
  content_summary: optionalBoundedText(
    MAX_LENGTHS.content_summary,
    "内容の要約"
  ),
  why_resonated: optionalBoundedText(MAX_LENGTHS.why_resonated, "なぜ刺さったか"),
  how_to_apply: optionalBoundedText(MAX_LENGTHS.how_to_apply, "どう活かすか"),
  surprising_point: optionalBoundedText(
    MAX_LENGTHS.surprising_point,
    "意外だった点"
  ),
  quote: optionalBoundedText(MAX_LENGTHS.quote, "お気に入りの一節"),
  tags: tagsSchema,
});

/** フォームstateの型（全フィールド文字列ベース。`<input>`/`<select>`/`<textarea>`のvalueをそのまま保持する）。 */
export type RawBookFormValues = {
  title: string;
  author: string;
  publisher: string;
  rating: string;
  finished_date: string;
  one_line_summary: string;
  content_summary: string;
  why_resonated: string;
  how_to_apply: string;
  surprising_point: string;
  quote: string;
  tags: string;
};

/** `bookFormSchema.safeParse`成功時の出力型。 */
export type BookFormValues = z.infer<typeof bookFormSchema>;
