"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Book } from "../../../types/book";
import { Field } from "../Field";
import {
  bookFormSchema,
  MAX_LENGTHS,
  MAX_TAGS,
  MAX_TAG_LENGTH,
  type RawBookFormValues,
} from "../new/validation";

/** `GET /api/books/[id]`が読み取れないエラーで失敗した場合の汎用日本語エラー文言
 * （技術的なエラーをそのまま出さない方針、他画面と同様）。 */
const GENERIC_LOAD_ERROR_MESSAGE =
  "本の情報の取得に失敗しました。時間をおいて再度お試しください。";

/** `PUT /api/books/[id]`向けの汎用エラー文言。 */
const GENERIC_SAVE_ERROR_MESSAGE =
  "本の更新に失敗しました。時間をおいて再度お試しください。";

/** `DELETE /api/books/[id]`向けの汎用エラー文言。 */
const GENERIC_DELETE_ERROR_MESSAGE =
  "本の削除に失敗しました。時間をおいて再度お試しください。";

/** フィールドごとのエラーメッセージ（`bookFormSchema`のissuesから`path[0]`単位で抽出）。
 * `app/books/new/page.tsx`と同じ型・組み立て方。 */
type FieldErrors = Partial<Record<keyof RawBookFormValues, string>>;

const inputClassName =
  "h-12 min-h-11 w-full rounded-lg border border-zinc-300 px-4 text-base text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const textareaClassName =
  "min-h-11 w-full rounded-lg border border-zinc-300 px-4 py-3 text-base text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";

/** `Book`（DBの生の値）を、フォームstate（すべて文字列ベース）の初期値に変換する。 */
function bookToFormValues(book: Book): RawBookFormValues {
  return {
    title: book.title,
    author: book.author ?? "",
    publisher: book.publisher ?? "",
    rating: book.rating !== null ? String(book.rating) : "",
    finished_date: book.finished_date ?? "",
    one_line_summary: book.one_line_summary ?? "",
    content_summary: book.content_summary ?? "",
    why_resonated: book.why_resonated ?? "",
    how_to_apply: book.how_to_apply ?? "",
    surprising_point: book.surprising_point ?? "",
    quote: book.quote ?? "",
    tags: book.tags.join(", "),
  };
}

/**
 * 本の詳細・編集画面。表示専用モードは設けず、取得した記録内容をそのまま編集可能な
 * フォームの初期値として表示する（常時編集可能なフォーム。多くのメモアプリと同じ発想）。
 * 保存は`PUT /api/books/[id]`、削除は確認ダイアログを挟んだ上で`DELETE /api/books/[id]`を呼ぶ。
 */
export default function BookDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const bookId = params.id;

  const [book, setBook] = useState<Book | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [formValues, setFormValues] = useState<RawBookFormValues | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadBook() {
      setLoadError(null);
      setNotFound(false);
      try {
        const response = await fetch(`/api/books/${bookId}`);

        if (response.status === 401) {
          router.push("/login");
          return;
        }

        if (response.status === 404) {
          if (!cancelled) {
            setNotFound(true);
          }
          return;
        }

        if (!response.ok) {
          if (!cancelled) {
            setLoadError(GENERIC_LOAD_ERROR_MESSAGE);
          }
          return;
        }

        const data: Book = await response.json();
        if (!cancelled) {
          setBook(data);
          setFormValues(bookToFormValues(data));
        }
      } catch {
        if (!cancelled) {
          setLoadError(GENERIC_LOAD_ERROR_MESSAGE);
        }
      }
    }

    loadBook();

    return () => {
      cancelled = true;
    };
  }, [bookId, router]);

  function updateField<K extends keyof RawBookFormValues>(
    field: K,
    value: RawBookFormValues[K]
  ) {
    setFormValues((current) =>
      current ? { ...current, [field]: value } : current
    );
  }

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving || !formValues) {
      return;
    }

    const parsed = bookFormSchema.safeParse(formValues);
    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && !(field in nextErrors)) {
          nextErrors[field as keyof RawBookFormValues] = issue.message;
        }
      }
      setFieldErrors(nextErrors);
      setSaveError(null);
      return;
    }

    setFieldErrors({});
    setSaveError(null);
    setIsSaving(true);

    // `bookFormSchema`は空欄の任意項目を`undefined`に変換するが、`JSON.stringify`は
    // 値が`undefined`のキーをボディから丸ごと除外してしまう。`PUT`は部分更新（送った
    // キーだけを更新する）ため、キーごと消えると「そのカラムには一切触れない」＝
    // 既存の値が残ってしまう（ユーザーが空欄にして保存した意図に反する）。
    // ユーザーが項目を空にした場合は「そのカラムをnullにする」という意味になるよう、
    // 送信直前に`undefined`を明示的に`null`へ変換してからJSON化する。
    const payload = Object.fromEntries(
      Object.entries(parsed.data).map(([key, value]) => [
        key,
        value === undefined ? null : value,
      ])
    );

    try {
      const response = await fetch(`/api/books/${bookId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.status === 200) {
        router.push("/");
        return;
      }

      if (response.status === 401) {
        router.push("/login");
        return;
      }

      let message = GENERIC_SAVE_ERROR_MESSAGE;
      try {
        const data: unknown = await response.json();
        if (
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
        ) {
          message = (data as { error: string }).error;
        }
      } catch {
        // レスポンスがJSONとして読めない場合は汎用メッセージのままにする。
      }
      setSaveError(message);
    } catch {
      setSaveError(GENERIC_SAVE_ERROR_MESSAGE);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (isDeleting) {
      return;
    }
    const confirmed = window.confirm(
      "この本の記録を削除しますか？元に戻せません。"
    );
    if (!confirmed) {
      return;
    }

    setDeleteError(null);
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/books/${bookId}`, {
        method: "DELETE",
      });

      if (response.status === 200) {
        router.push("/");
        return;
      }

      if (response.status === 401) {
        router.push("/login");
        return;
      }

      let message = GENERIC_DELETE_ERROR_MESSAGE;
      try {
        const data: unknown = await response.json();
        if (
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
        ) {
          message = (data as { error: string }).error;
        }
      } catch {
        // レスポンスがJSONとして読めない場合は汎用メッセージのままにする。
      }
      setDeleteError(message);
    } catch {
      setDeleteError(GENERIC_DELETE_ERROR_MESSAGE);
    } finally {
      setIsDeleting(false);
    }
  }

  const isLoading = !notFound && !loadError && !formValues;

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900 sm:px-6">
        <Link
          href="/"
          className="flex h-11 min-h-11 items-center justify-center rounded-lg px-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          ← 一覧に戻る
        </Link>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          本の記録を編集
        </h1>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
        {isLoading && (
          <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
            読み込み中…
          </p>
        )}

        {notFound && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              この本の記録が見つかりませんでした。
            </p>
            <Link
              href="/"
              className="flex h-11 min-h-11 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              一覧に戻る
            </Link>
          </div>
        )}

        {loadError && (
          <p role="alert" className="text-center text-sm text-red-600 dark:text-red-400">
            {loadError}
          </p>
        )}

        {formValues && book && (
          <div className="flex flex-col gap-6">
            {book.cover_url && (
              // 素の<img>を意図的に使用（next/imageは外部ドメイン許可設定が必要になるため、
              // BRIEF記載の方針通りこちらを採用。書影ドメインは登録候補によって変わりうる）。
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={book.cover_url}
                alt={`${book.title}の表紙`}
                className="h-32 w-auto self-start rounded-lg object-cover shadow-sm"
              />
            )}

            <form onSubmit={handleFormSubmit} className="flex flex-col gap-5">
              <Field label="書名" htmlFor="title" error={fieldErrors.title} required>
                <input
                  id="title"
                  name="title"
                  type="text"
                  required
                  value={formValues.title}
                  onChange={(event) => updateField("title", event.target.value)}
                  disabled={isSaving}
                  className={inputClassName}
                />
              </Field>

              <Field label="著者" htmlFor="author" error={fieldErrors.author}>
                <input
                  id="author"
                  name="author"
                  type="text"
                  value={formValues.author}
                  onChange={(event) => updateField("author", event.target.value)}
                  disabled={isSaving}
                  className={inputClassName}
                />
              </Field>

              <Field label="出版社" htmlFor="publisher" error={fieldErrors.publisher}>
                <input
                  id="publisher"
                  name="publisher"
                  type="text"
                  value={formValues.publisher}
                  onChange={(event) => updateField("publisher", event.target.value)}
                  disabled={isSaving}
                  className={inputClassName}
                />
              </Field>

              <Field label="評価" htmlFor="rating" error={fieldErrors.rating} required>
                <select
                  id="rating"
                  name="rating"
                  required
                  value={formValues.rating}
                  onChange={(event) => updateField("rating", event.target.value)}
                  disabled={isSaving}
                  className={inputClassName}
                >
                  <option value="">選択してください</option>
                  {[5, 4, 3, 2, 1].map((value) => (
                    <option key={value} value={value}>
                      {"★".repeat(value)}（{value}）
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="完読日"
                htmlFor="finished_date"
                error={fieldErrors.finished_date}
              >
                <input
                  id="finished_date"
                  name="finished_date"
                  type="date"
                  value={formValues.finished_date}
                  onChange={(event) =>
                    updateField("finished_date", event.target.value)
                  }
                  disabled={isSaving}
                  className={inputClassName}
                />
              </Field>

              <Field
                label="一言要約"
                htmlFor="one_line_summary"
                error={fieldErrors.one_line_summary}
                hint={`${formValues.one_line_summary.length}/${MAX_LENGTHS.one_line_summary}文字`}
              >
                <input
                  id="one_line_summary"
                  name="one_line_summary"
                  type="text"
                  value={formValues.one_line_summary}
                  onChange={(event) =>
                    updateField("one_line_summary", event.target.value)
                  }
                  disabled={isSaving}
                  className={inputClassName}
                />
              </Field>

              <Field
                label="内容の要約"
                htmlFor="content_summary"
                error={fieldErrors.content_summary}
                hint={`${formValues.content_summary.length}/${MAX_LENGTHS.content_summary}文字`}
              >
                <textarea
                  id="content_summary"
                  name="content_summary"
                  rows={4}
                  value={formValues.content_summary}
                  onChange={(event) =>
                    updateField("content_summary", event.target.value)
                  }
                  disabled={isSaving}
                  className={textareaClassName}
                />
              </Field>

              <Field
                label="なぜ刺さったか"
                htmlFor="why_resonated"
                error={fieldErrors.why_resonated}
                hint={`${formValues.why_resonated.length}/${MAX_LENGTHS.why_resonated}文字`}
              >
                <textarea
                  id="why_resonated"
                  name="why_resonated"
                  rows={3}
                  value={formValues.why_resonated}
                  onChange={(event) =>
                    updateField("why_resonated", event.target.value)
                  }
                  disabled={isSaving}
                  className={textareaClassName}
                />
              </Field>

              <Field
                label="どう活かすか"
                htmlFor="how_to_apply"
                error={fieldErrors.how_to_apply}
                hint={`${formValues.how_to_apply.length}/${MAX_LENGTHS.how_to_apply}文字`}
              >
                <textarea
                  id="how_to_apply"
                  name="how_to_apply"
                  rows={3}
                  value={formValues.how_to_apply}
                  onChange={(event) =>
                    updateField("how_to_apply", event.target.value)
                  }
                  disabled={isSaving}
                  className={textareaClassName}
                />
              </Field>

              <Field
                label="意外だった点"
                htmlFor="surprising_point"
                error={fieldErrors.surprising_point}
                hint={`${formValues.surprising_point.length}/${MAX_LENGTHS.surprising_point}文字`}
              >
                <textarea
                  id="surprising_point"
                  name="surprising_point"
                  rows={3}
                  value={formValues.surprising_point}
                  onChange={(event) =>
                    updateField("surprising_point", event.target.value)
                  }
                  disabled={isSaving}
                  className={textareaClassName}
                />
              </Field>

              <Field
                label="お気に入りの一節"
                htmlFor="quote"
                error={fieldErrors.quote}
                hint={`${formValues.quote.length}/${MAX_LENGTHS.quote}文字`}
              >
                <textarea
                  id="quote"
                  name="quote"
                  rows={2}
                  value={formValues.quote}
                  onChange={(event) => updateField("quote", event.target.value)}
                  disabled={isSaving}
                  className={textareaClassName}
                />
              </Field>

              <Field
                label="タグ（カンマ区切り）"
                htmlFor="tags"
                error={fieldErrors.tags}
                hint={`最大${MAX_TAGS}個、1個あたり${MAX_TAG_LENGTH}文字まで`}
              >
                <input
                  id="tags"
                  name="tags"
                  type="text"
                  placeholder="例: 小説, 自己啓発"
                  value={formValues.tags}
                  onChange={(event) => updateField("tags", event.target.value)}
                  disabled={isSaving}
                  className={inputClassName}
                />
              </Field>

              {saveError && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                  {saveError}
                </p>
              )}

              <button
                type="submit"
                disabled={isSaving}
                className="flex h-12 min-h-11 w-full items-center justify-center rounded-lg bg-zinc-900 text-base font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {isSaving ? "保存中…" : "この内容で保存する"}
              </button>
            </form>

            {deleteError && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {deleteError}
              </p>
            )}

            <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex h-11 min-h-11 w-full items-center justify-center rounded-lg border border-red-300 px-4 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
              >
                {isDeleting ? "削除中…" : "この本の記録を削除する"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
